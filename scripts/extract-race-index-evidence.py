"""Extract bibliographic identity only; do not retain descriptions, traits or images."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

class SpeciesIndex(HTMLParser):
    def __init__(self, names):
        super().__init__(convert_charrefs=True)
        self.names = set(names)
        self.depth = 0
        self.card = None
        self.records = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get('class', '').split()
        if tag == 'li' and self.card is not None:
            self.depth += 1
        elif tag == 'li' and 'listing-card-race' in classes:
            title, separator, publication = attrs.get('data-collapsible-search', '').partition('|')
            if title.strip().lower() in self.names:
                if not separator or not publication.strip():
                    raise ValueError('Missing publication label')
                self.card = {'name': title.strip(), 'publication': publication.strip(), 'links': []}
                self.depth = 1
        if self.card is not None and tag == 'a' and 'listing-card__link' in classes:
            self.card['links'].append(attrs.get('href', ''))

    def handle_endtag(self, tag):
        if tag != 'li' or self.card is None:
            return
        self.depth -= 1
        if self.depth:
            return
        if len(self.card['links']) != 1:
            raise ValueError('Expected one species identity link')
        url = urljoin('https://www.dndbeyond.com', self.card['links'][0])
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.netloc != 'www.dndbeyond.com' or not re.fullmatch(r'/species/[0-9]+-[a-z0-9-]+', parsed.path) or parsed.query or parsed.fragment:
            raise ValueError('Unexpected species identity URL')
        self.records.append({'name':self.card['name'], 'publication':self.card['publication'], 'url':url})
        self.card = None


def extract(html, names):
    parser = SpeciesIndex(names)
    parser.feed(html)
    parser.close()
    if parser.card is not None:
        raise ValueError('Unclosed identity card')
    keys = [(record['name'].lower(), record['publication']) for record in parser.records]
    if len(keys) != len(set(keys)):
        raise ValueError('Ambiguous duplicate publication/name')
    return sorted(parser.records, key=lambda record:(record['name'].lower(),record['publication']))

if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--html', required=True)
    args.add_argument('--names', required=True)
    args.add_argument('--output', required=True)
    options = args.parse_args()
    raw = Path(options.html).read_bytes()
    names = sorted(set(name.strip().lower() for name in options.names.split(',') if name.strip()))
    evidence = {'schemaVersion':1,'checkedOn':'2026-11-20','status':'publication-identity-evidence-not-full-rules',
      'url':'https://www.dndbeyond.com/species','htmlSha256':hashlib.sha256(raw).hexdigest(),
      'method':'Extract selected listing-card-race metadata and identity links; full bodies not retained.',
      'selectedNames':names,'records':extract(raw.decode('utf-8'), names),
      'faq':{'url':'https://www.dndbeyond.com/posts/1201-faq-for-mordenkainen-presents-monsters-of-the',
        'location':'Questions about availability of old and new races and existing characters; article updated 2022-05-12',
        'claim':'New versions coexist with older races; existing characters are not automatically changed.',
        'method':'Primary publisher FAQ read through web tool'},
      'accessLimitations':['Six detail links for Firbolg, Bugbear and Kobold were opened: MotM links redirect to marketplace and Volo links to legacy landing page. Full rule bodies were not compared.',
        'Listing labels establish publication identities, not exact errata, translation rights or final canonical units.']}
    Path(options.output).write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'selectedNames':len(names),'publicationIdentityRecords':len(evidence['records'])}))
