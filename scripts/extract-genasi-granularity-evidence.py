"""Extract only Genasi headings, publication labels and TOC hierarchy, never rule bodies."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import urljoin

spec = importlib.util.spec_from_file_location('race_toc', Path(__file__).with_name('extract-race-toc-evidence.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
ELEMENTS = ('Air', 'Earth', 'Fire', 'Water')

class Hierarchy(base.Toc):
    def __init__(self):
        super().__init__()
        self.list_stack = []
        self.lists = 0
        self.items = []
        self.parents = {}
        self.structured = []
    def handle_starttag(self, tag, attrs):
        super().handle_starttag(tag, attrs)
        if tag == 'ul':
            self.lists += 1
            self.list_stack.append(self.lists)
        if tag == 'li':
            self.items.append({'list': self.list_stack[-1] if self.list_stack else None,
                'indented': 'toc--indented' in dict(attrs).get('class', '').split()})
    def handle_endtag(self, tag):
        if tag == 'a' and self.anchor is not None:
            href, label = self.anchor
            text = ' '.join(label.split())
            item = self.items[-1] if self.items else None
            parent = self.parents.get(item['list']) if item else None
            self.structured.append({'href': href, 'heading': text,
                'indented': bool(item and item['indented']),
                'parent': parent if item and item['indented'] else None})
            if item and not item['indented']:
                self.parents[item['list']] = {'href': href, 'heading': text}
        super().handle_endtag(tag)
        if tag == 'li' and self.items:
            self.items.pop()
        if tag == 'ul' and self.list_stack:
            self.list_stack.pop()

class LegacyHeaders(base.Toc):
    def __init__(self):
        super().__init__()
        self.current = None
        self.records = []
    def handle_starttag(self, tag, attrs):
        super().handle_starttag(tag, attrs)
        if tag == 'h2':
            self.current = {'attrs': dict(attrs), 'text': '', 'title': ''}
        elif tag == 'span' and self.current is not None and not self.current['title']:
            self.current['title'] = self.current['text'].strip()
    def handle_data(self, data):
        super().handle_data(data)
        if self.current is not None:
            self.current['text'] += data
    def handle_endtag(self, tag):
        super().handle_endtag(tag)
        if tag == 'h2' and self.current is not None:
            record = self.current
            self.records.append({'heading': record['title'] or ' '.join(record['text'].split()),
                'fragment': record['attrs'].get('id'),
                'publicationSlug': record['attrs'].get('data-content-slug'),
                'contentType': record['attrs'].get('data-content-type'),
                'legacy': record['attrs'].get('aria-describedby') == 'legacy-badge'})
            self.current = None

def extract_motm(raw):
    p = Hierarchy()
    p.feed(raw.decode('utf-8')); p.close()
    title = 'Mordenkainen Presents: Monsters of the Multiverse'
    if title not in p.headings:
        raise ValueError('Missing exact MotM publication heading')
    records = []
    for label in ['Genasi'] + [element+' Genasi' for element in ELEMENTS]:
        rows = [r for r in p.structured if r['heading'] == label]
        if len(rows) != 1:
            raise ValueError('Missing or ambiguous Genasi heading')
        row = rows[0]
        fragment = 'Genasi' if label == 'Genasi' else label.replace(' ', '')+'Traits'
        target = 'https://www.dndbeyond.com/sources/motm/fantastical-races#'+fragment
        if urljoin('https://www.dndbeyond.com', row['href']) != target:
            raise ValueError('Genasi heading is outside the exact race chapter or fragment')
        parent = row['parent']
        if label == 'Genasi':
            if row['indented']:
                raise ValueError('Family heading cannot be a child')
        elif not row['indented'] or not parent or parent['heading'] != 'Genasi' or urljoin('https://www.dndbeyond.com', parent['href']) != 'https://www.dndbeyond.com/sources/motm/fantastical-races#Genasi':
            raise ValueError('Genasi variants require the evidenced family indentation')
        records.append({'heading': label, 'targetUrl': target,
            'role': 'family-heading' if label == 'Genasi' else 'indented-variant-heading',
            'parentHeading': None if label == 'Genasi' else 'Genasi'})
    return {'sourceId': '158', 'title': title, 'url': 'https://www.dndbeyond.com/sources/dnd/motm',
        'htmlSha256': hashlib.sha256(raw).hexdigest(), 'records': records}

def extract_legacy(raw):
    p = LegacyHeaders()
    p.feed(raw.decode('utf-8')); p.close()
    if 'Genasi' not in p.headings:
        raise ValueError('Missing exact Genasi page heading')
    records = []
    for element in ELEMENTS:
        label = element+' Genasi'
        matches = [r for r in p.records if r['heading'] == label]
        if len(matches) != 1:
            raise ValueError('Missing or ambiguous legacy variant heading')
        row = matches[0]
        if row['fragment'] != element+'Genasi' or row['publicationSlug'] != 'elemental-evil-players-companion' or row['contentType'] != 'species-option' or not row['legacy']:
            raise ValueError('Legacy publication, fragment or type changed')
        records.append({'heading': label, 'targetUrl': 'https://www.dndbeyond.com/species/23-genasi#'+row['fragment'],
            'publicationSlug': row['publicationSlug'], 'legacy': True})
    return {'sourceId': None, 'publication': "Elemental Evil Player's Companion",
        'url': 'https://www.dndbeyond.com/species/23-genasi',
        'htmlSha256': hashlib.sha256(raw).hexdigest(), 'records': records,
        'observationSourceAssignment': False}

def extract(motm, pota, legacy):
    p = base.extract(pota, 'pota')
    if p['records'][0]['targetUrl'] != 'https://www.dndbeyond.com/sources/pota/appendix-a-genasi':
        raise ValueError('PotA family heading points to another chapter')
    return {'schemaVersion': 1, 'checkedOn': '2026-11-20',
        'status': 'genasi-headings-and-publication-metadata-not-full-rules',
        'motm': extract_motm(motm), 'pota': p, 'supportingOtherPublication': extract_legacy(legacy),
        'limitations': ['TOC indentation witnesses a family and four variant headings, not four accepted catalog records.',
            'Elemental Evil metadata is not assigned to source107 Princes of the Apocalypse.',
            'The accessible PotA TOC has only the family heading; its chapter redirects to the marketplace.',
            'Full rules, exact versions, translation rights and a catalog denominator remain unaccepted.']}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ['motm', 'pota', 'legacy', 'output']:
        parser.add_argument('--'+name, required=True)
    args = parser.parse_args()
    result = extract(*(Path(getattr(args, name)).read_bytes() for name in ['motm', 'pota', 'legacy']))
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'motmHeadings': len(result['motm']['records']), 'potaHeadings': len(result['pota']['records']),
        'supportingOtherPublicationHeadings': len(result['supportingOtherPublication']['records'])}))
