"""Retain only selected publication headings and links, never rule bodies."""
import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

BOOKS = {
    'twbtw': ('151', 'The Wild Beyond the Witchlight', {'Fairy': 'fairy', 'Harengon': 'harengon'}),
    'ggtr': ('112', "Guildmasters' Guide to Ravnica", {'Centaur': 'centaur', 'Minotaur': 'minotaur'}),
    'pota': ('107', 'Princes of the Apocalypse', {'Appendix A: Genasi': 'genasi'}),
}

class Toc(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.anchor = None
        self.h1 = None
        self.headings = []
        self.links = []
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.anchor = [dict(attrs).get('href', ''), '']
        if tag == 'h1':
            self.h1 = ''
    def handle_data(self, data):
        if self.anchor is not None:
            self.anchor[1] += data
        if self.h1 is not None:
            self.h1 += data
    def handle_endtag(self, tag):
        if tag == 'a' and self.anchor is not None:
            self.links.append((self.anchor[0], ' '.join(self.anchor[1].split())))
            self.anchor = None
        if tag == 'h1' and self.h1 is not None:
            self.headings.append(' '.join(self.h1.split()))
            self.h1 = None

def extract(raw, book):
    source_id, title, selected = BOOKS[book]
    parser = Toc()
    parser.feed(raw.decode('utf-8'))
    parser.close()
    if title not in parser.headings:
        raise ValueError('Missing exact publication heading')
    records = []
    for label, name in selected.items():
        matches = [href for href, text in parser.links if text == label]
        if len(matches) != 1:
            raise ValueError('Missing or ambiguous selected heading')
        url = urljoin('https://www.dndbeyond.com', matches[0])
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.netloc != 'www.dndbeyond.com' or parsed.query or not any(parsed.path.startswith(prefix+book+'/') for prefix in ['/sources/', '/sources/dnd/', '/compendium/rules/']):
            raise ValueError('Selected heading points outside its publication')
        records.append({'name': name, 'heading': label, 'targetUrl': url})
    return {'sourceId': source_id, 'book': book, 'title': title,
        'url': 'https://www.dndbeyond.com/sources/dnd/'+book,
        'htmlSha256': hashlib.sha256(raw).hexdigest(), 'records': records}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = {'schemaVersion': 1, 'checkedOn': '2026-11-20',
        'status': 'selected-publication-headings-not-full-rules',
        'sources': [extract((Path(args.directory)/(book+'.html')).read_bytes(), book) for book in BOOKS],
        'limitations': ['Contents headings establish publication attribution only.',
            'Witchlight chapter links redirect to the marketplace; full text was not read.',
            'An absent heading is unresolved evidence, not proof a book lacks the race.']}
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'sources': len(result['sources']), 'headings': sum(len(s['records']) for s in result['sources'])}))
