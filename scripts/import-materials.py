"""Import the supplied final DOCX standards and Lesson 1 text using stdlib only.

Run after replacing the original files in documents/. The PDF and single cover image are visual exports of the original PPTX.
"""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}
W = '{' + NS['w'] + '}'


def val(element, fallback=None):
    return element.get(W + 'val', fallback) if element is not None else fallback


def text(element):
    return ''.join(t.text or '' for t in element.findall('.//w:t', NS)).strip()


def standard(number, source):
    with ZipFile(ROOT / source) as archive:
        document = ET.fromstring(archive.read('word/document.xml'))
        styles = {s.get(W + 'styleId'): s for s in ET.fromstring(archive.read('word/styles.xml'))}
        relations = {r.get('Id'): r.get('Target') for r in
                     ET.fromstring(archive.read('word/_rels/document.xml.rels'))}
        numbering = ET.fromstring(archive.read('word/numbering.xml'))
        abstracts = {a.get(W + 'abstractNumId'): a for a in numbering.findall('w:abstractNum', NS)}
        nums = {n.get(W + 'numId'): n for n in numbering.findall('w:num', NS)}
        counters = {}
        blocks = []

        def properties(paragraph, name):
            own = paragraph.find('w:pPr/' + name, NS)
            if own is not None:
                return own
            style_id = val(paragraph.find('w:pPr/w:pStyle', NS))
            visited = set()
            while style_id in styles and style_id not in visited:
                visited.add(style_id)
                style = styles[style_id]
                prop = style.find('w:pPr/' + name, NS)
                if prop is not None:
                    return prop
                style_id = val(style.find('w:basedOn', NS))

        def list_marker(paragraph):
            prop = properties(paragraph, 'w:numPr')
            if prop is None:
                return {}
            num_id = val(prop.find('w:numId', NS))
            level = int(val(prop.find('w:ilvl', NS), '0'))
            if num_id not in nums or num_id == '0':
                return {}
            num = nums[num_id]
            abstract = abstracts[val(num.find('w:abstractNumId', NS))]
            entry = abstract.find(f'w:lvl[@w:ilvl="{level}"]', NS)
            override = num.find(f'w:lvlOverride[@w:ilvl="{level}"]', NS)
            if override is not None and override.find('w:lvl', NS) is not None:
                entry = override.find('w:lvl', NS)
            if entry is None:
                return {}
            start = int(val(entry.find('w:start', NS), '1'))
            if override is not None:
                start = int(val(override.find('w:startOverride', NS), str(start)))
            state = counters.setdefault(num_id, {})
            state[level] = state.get(level, start - 1) + 1
            for deeper in list(state):
                if deeper > level:
                    del state[deeper]
            fmt = val(entry.find('w:numFmt', NS), 'bullet')
            template = val(entry.find('w:lvlText', NS), '%1.')
            marker = '•' if fmt == 'bullet' else re.sub(
                r'%(\d)', lambda m: str(state.get(int(m[1]) - 1, 1)), template)
            return {'marker': marker, 'indent': level}

        def paragraph(p):
            content = text(p)
            style_id = val(p.find('w:pPr/w:pStyle', NS))
            style = styles.get(style_id)
            style_name = val(style.find('w:name', NS), '') if style is not None else ''
            # The web reader has its own clickable TOC instead of Word page numbers.
            if style_name.lower().startswith('toc '):
                return []
            result = []
            if content:
                block = {'type': 'paragraph', 'text': content, **list_marker(p)}
                heading = re.fullmatch(r'Heading (\d)', style_name, re.I)
                if heading:
                    level = int(heading[1])
                    block.update(type='heading', level=max(2, level - (1 if number == 3 else 0)))
                result.append(block)
            for drawing in p.findall('.//a:blip', NS):
                target = relations.get(drawing.get('{' + NS['r'] + '}embed'))
                if not target:
                    continue
                filename = f'standard-{number}-{PurePosixPath(target).name}'
                dest = ROOT / 'media/standards' / filename
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(archive.read('word/' + target))
                result.append({'type': 'image', 'src': dest.relative_to(ROOT).as_posix(),
                               'alt': f'Схема из окончательной редакции стандарта №{number}'})
            return result

        def walk(parent):
            output = []
            for element in parent:
                if element.tag == W + 'p':
                    output.extend(paragraph(element))
                elif element.tag == W + 'tbl':
                    rows = []
                    for row in element.findall('w:tr', NS):
                        cells = []
                        for cell in row.findall('w:tc', NS):
                            span = int(val(cell.find('w:tcPr/w:gridSpan', NS), '1'))
                            cells.append({'span': span, 'blocks': walk(cell)})
                        rows.append(cells)
                    output.append({'type': 'table', 'rows': rows})
                elif element.tag == W + 'sdt':
                    content = element.find('w:sdtContent', NS)
                    if content is not None:
                        output.extend(walk(content))
            return output

        blocks = walk(document.find('w:body', NS))
        blocks[0]['type'] = 'title'
        for index, block in enumerate(blocks):
            block['id'] = f'std-{number}-block-{index:03}'
        return {'id': number, 'title': blocks[0]['text'], 'edition': 'Редакция 2 от ' + ('23.09.2026' if number == 4 else '18.09.2026'),
                'source': source, 'blocks': blocks}


def lesson(number=1):
    stem = {1:'lesson-1-why-standards',2:'lesson-2-routing',3:'lesson-3-lead','3-advanced':'lesson-3-lead-advanced'}[number]
    with ZipFile(ROOT / f'documents/{stem}.pptx') as archive:
        # Follow presentation relationships, not the order of filenames in ZIP.
        relationships = {r.get('Id'): r.get('Target') for r in
                         ET.fromstring(archive.read('ppt/_rels/presentation.xml.rels'))}
        presentation = ET.fromstring(archive.read('ppt/presentation.xml'))
        slides = []
        for i, item in enumerate(presentation.findall('.//{http://schemas.openxmlformats.org/presentationml/2006/main}sldId'), 1):
            name = 'ppt/' + relationships[item.get('{' + NS['r'] + '}id')]
            xml = ET.fromstring(archive.read(name))
            paragraphs = [''.join(t.text or '' for t in p.findall('.//a:t', NS))
                          for p in xml.findall('.//a:p', NS)]
            paragraphs = [p for p in paragraphs if p.strip()]
            title = paragraphs[0] if i == 1 else next(
                (p for p in paragraphs[1:] if not p.isdigit()), paragraphs[0])
            slides.append({'number': i, 'title': title, 'paragraphs': paragraphs,
                           'sourceSlide': name})
        result = {'id': str(number),
                  'title': 'Как не терять клиента' if number == 1 else 'Диспетчеризация и регистрация в ЕИС',
                  'subtitle': 'Зачем мы вводим стандарты продаж СМБ' if number == 1 else 'Как не потерять обращение при маршрутизации',
                  'source': f'documents/{stem}.pptx',
                  'pdf': f'documents/{stem}.pdf' if number in (1,2) else None, 'slides': slides}
        if number in (3, '3-advanced'):
            result.update(title='Лид и квалификация Лида' + (' — усложнённые кейсы' if number == '3-advanced' else ''), subtitle='Стандарт №4 · работа с Лидом и решение по квалификации', label='Урок 3' + (' · усложнённые кейсы' if number == '3-advanced' else ''))
        if number == 1:
            result['cover'] = 'media/lessons/lesson-1/slide-01.jpg'
        return result


if __name__ == '__main__':
    sources = ['documents/glossary-v2.docx', 'documents/standard-2-v2.docx', 'documents/standard-3-v2.docx', 'documents/standard-4-v2.docx']
    lessons = [lesson(1), lesson(2), lesson(3), lesson('3-advanced')]
    materials = {'standards': [standard(n, source) for n, source in enumerate(sources, 1)],
                 'lesson': lessons[0], 'lessons': lessons}
    serialized = json.dumps(materials, ensure_ascii=False, indent=2).replace('<', '\\u003c')
    (ROOT / 'assets/materials.js').write_text('// Generated from the supplied final originals by scripts/import-materials.py.\nwindow.PORTAL_MATERIALS = ' + serialized + ';\n')
    print('Imported full standards 1–4 and lesson presentations 1–3')
