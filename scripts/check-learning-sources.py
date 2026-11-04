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
