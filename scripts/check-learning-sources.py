"""Check the published content against the original DOCX and PPTX, without Office dependencies."""
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET
import json
import re

root = Path(__file__).resolve().parent.parent
source = (root / 'assets/learning.js').read_text()
learning = json.loads(re.search(r'window.PORTAL_LEARNING = ([\s\S]*);\s*$', source)[1])
w = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with ZipFile(root / 'documents/glossary-v2.docx') as archive:
    document = ET.fromstring(archive.read('word/document.xml'))
paragraphs = [''.join(t.text or '' for t in p.findall('.//w:t', w)).strip()
              for p in document.findall('w:body/w:p', w)]
definitions = paragraphs[paragraphs.index('Термины и определения') + 1:]
definitions = [re.match(r'^(.+?)\s[-–—]\s?(.*)$', text, re.S) for text in definitions if text]
assert len(definitions) == len(learning['glossary']['terms']) == 87
for original, published in zip(definitions, learning['glossary']['terms']):
    assert original, 'Definition could not be parsed'
    assert (original[1], original[2]) == (published['term'], published['desc']), published['term']

a = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
with ZipFile(root / 'documents/sales-memos-v2.pptx') as archive:
    slides = sorted([n for n in archive.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)],
                    key=lambda n: int(re.search(r'(\d+)\.xml', n)[1]))
    assert len(slides) == len(learning['memos']) == 8
    for name, memo in zip(slides, learning['memos']):
        xml = ET.fromstring(archive.read(name))
        original = [''.join(t.text or '' for t in p.findall('.//a:t', a)) for p in xml.findall('.//a:p', a)]
        original = [p for p in original if p.strip()]
        published = [str(memo['standard']), f"Стандарт №{memo['standard']}", memo['title'], memo['summary'], 'Памятка сотрудника ОП']
        published.extend(memo['flow'])
        for section in memo['sections']:
            published.extend([section['title'], *section['items']])
        published.extend(memo['notes'])
        published.append('Мини-проверка')
        for metric in memo['metrics']:
            published.extend([metric['value'], metric['label']])
        assert original == published, f"Slide {memo['slide']} differs from original"
print('PASS: all 87 definitions and all paragraphs of 8 memos match the original files')

# Full standards use the final originals, including tables and appendices.
source = (root / 'assets/materials.js').read_text()
materials = json.loads(re.search(r'window.PORTAL_MATERIALS = ([\s\S]*);\s*$', source)[1])


def published_paragraphs(blocks):
    result = []
    for block in blocks:
        if 'text' in block:
            result.append(block['text'])
        if block['type'] == 'table':
            for row in block['rows']:
                for cell in row:
                    result.extend(published_paragraphs(cell['blocks']))
    return result


assert [doc['id'] for doc in materials['standards']] == [2, 3]
for doc in materials['standards']:
    with ZipFile(root / doc['source']) as archive:
        document = ET.fromstring(archive.read('word/document.xml'))
        styles = ET.fromstring(archive.read('word/styles.xml'))
        toc_styles = {s.get('{' + w['w'] + '}styleId') for s in styles
                      if s.find('w:name', w) is not None and
                      s.find('w:name', w).get('{' + w['w'] + '}val', '').lower().startswith('toc ')}
        original = []
        for paragraph in document.findall('w:body//w:p', w):
            style = paragraph.find('w:pPr/w:pStyle', w)
            if style is not None and style.get('{' + w['w'] + '}val') in toc_styles:
                continue  # Word page numbers are replaced by clickable web navigation.
            content = ''.join(t.text or '' for t in paragraph.findall('.//w:t', w)).strip()
            if content:
                original.append(content)
        assert original == published_paragraphs(doc['blocks']), f"Full standard {doc['id']} differs from original"
        images = [b for b in doc['blocks'] if b['type'] == 'image']
        media = [name for name in archive.namelist() if name.startswith('word/media/')]
        assert len(images) == len(media)
        for image in images:
            name = Path(image['src']).name.split(f"standard-{doc['id']}-", 1)[1]
            assert (root / image['src']).read_bytes() == archive.read('word/media/' + name)
    print(f"PASS: full standard {doc['id']}, {len(original)} paragraphs including tables and appendices")

p = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
     'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', **a}
lesson = materials['lesson']
with ZipFile(root / lesson['source']) as archive:
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('ppt/_rels/presentation.xml.rels'))}
    order = ET.fromstring(archive.read('ppt/presentation.xml')).findall('p:sldIdLst/p:sldId', p)
    assert len(order) == len(lesson['slides']) == 30
    for item, slide in zip(order, lesson['slides']):
        name = 'ppt/' + rels[item.get('{' + p['r'] + '}id')]
        xml = ET.fromstring(archive.read(name))
        original = [''.join(t.text or '' for t in para.findall('.//a:t', a)) for para in xml.findall('.//a:p', a)]
        assert [t for t in original if t.strip()] == slide['paragraphs'], f"Lesson slide {slide['number']} differs"
assert (root / lesson['cover']).is_file()
assert (root / lesson['pdf']).is_file()
print('PASS: Lesson 1 presentation matches the source; PDF and cover exist')
