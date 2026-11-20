"""Extract public catalogue facts from saved DDB library HTML, never executing JS.

Only an allowlist of public book metadata is exported. Ownership/favorites,
account data and images are neither exported nor used for scope decisions.
"""
import argparse
from collections import Counter
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

REQUEST_URL = 'https://www.dndbeyond.com/sources'
LIBRARY_URL = 'https://www.dndbeyond.com/en/library'
ITEM_LIST_ID = LIBRARY_URL + '#itemlist'


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__(); self.active = None; self.parts = []; self.rows = []

    def handle_starttag(self, tag, attrs):
        if tag == 'script': self.active = dict(attrs); self.parts = []

    def handle_data(self, text):
        if self.active is not None: self.parts.append(text)

    def handle_endtag(self, tag):
        if tag == 'script' and self.active is not None:
            self.rows.append((self.active, ''.join(self.parts))); self.active = None


def public_book(row):
    required = ['id','name','relativePath','publisher','isThirdParty','ruleset','type','isLegacy','isFree','isReleased']
    if any(key not in row for key in required): raise ValueError('Incomplete public source metadata')
    if type(row['id']) is not int or row['id'] <= 0: raise ValueError('Invalid provider source ID')
    if any(not isinstance(row[key], str) or not row[key].strip() for key in ['name','relativePath','publisher','type']):
        raise ValueError('Invalid public source label')
    path = urlsplit(row['relativePath'])
    if path.scheme or path.netloc or path.query or not path.path.startswith('/sources/') or '..' in path.path.split('/'):
        raise ValueError('Non-public or foreign source path')
    if any(type(row[key]) is not bool for key in ['isThirdParty','isLegacy','isFree','isReleased']):
        raise ValueError('Invalid public source flags')
    ruleset = row['ruleset']
    if not isinstance(ruleset, dict) or any(not isinstance(ruleset.get(k), str) or not ruleset[k] for k in ['name','label']):
        raise ValueError('Missing explicit provider ruleset')
    if any(row.get(key) is not None and not isinstance(row[key], str) for key in ['sku','releaseDate']):
        raise ValueError('Invalid optional public metadata')
    if ruleset['name'] not in ['5e','5.5e']: bucket = 'provider-unresolved-ruleset'
    elif row['isThirdParty']: bucket = 'provider-third-party-flag'
    elif ruleset['name'] != '5e': bucket = 'provider-other-ruleset'
    elif row['publisher'] == 'Wizards of the Coast': bucket = 'wotc-labelled-provider-5e'
    else: bucket = 'non-third-party-co-brand-provider-5e'
    return {'observationId': 'ddb:library-source:' + str(row['id']), 'providerSourceId': row['id'],
            'title': row['name'], 'sourceUrl': 'https://www.dndbeyond.com' + row['relativePath'],
            'relativePath': row['relativePath'], 'sku': row.get('sku'),
            'displayedPublisher': row['publisher'], 'providerIsThirdParty': row['isThirdParty'],
            'providerRuleset': {'name': ruleset['name'], 'label': ruleset['label']},
            'providerType': row['type'], 'providerReleaseDate': row.get('releaseDate'),
            'providerIsLegacy': row['isLegacy'], 'providerIsFree': row['isFree'],
            'providerIsReleased': row['isReleased'], 'metadataBucket': bucket}


def extract(html):
    parser = Scripts(); parser.feed(html)
    books, text_seen, lists = {}, set(), []
    occurrences = 0

    def walk(value, depth=0):
        nonlocal occurrences
        if depth > 40: raise ValueError('Unexpected serialized metadata depth')
        if isinstance(value, dict):
            if value.get('@id') == ITEM_LIST_ID and value.get('@type') == 'ItemList': lists.append(value)
            if isinstance(value.get('relativePath'), str) and value['relativePath'].startswith('/sources/') and 'ruleset' in value:
                projected = public_book(value); ident = projected['providerSourceId']; occurrences += 1
                if ident in books and books[ident] != projected: raise ValueError('Conflicting repeated provider source')
                books[ident] = projected
            for nested in value.values(): walk(nested, depth+1)
        elif isinstance(value, list):
            for nested in value: walk(nested, depth+1)
        elif isinstance(value, str) and value not in text_seen:
            text_seen.add(value)
            if value[:1] in ('[','{'):
                try: decoded = json.loads(value)
                except ValueError: pass
                else: walk(decoded, depth+1)
            for line in value.splitlines():
                prefix, sep, payload = line.partition(':')
                if sep and re.fullmatch('[0-9a-f]+', prefix) and payload[:1] in ('[','{'):
                    try: decoded = json.loads(payload)
                    except ValueError: continue
                    walk(decoded, depth+1)

    for attrs, body in parser.rows:
        if attrs.get('type') == 'application/ld+json':
            walk(json.loads(body))
        call = body.strip().removesuffix(';')
        if call.startswith('self.__next_f.push(') and call.endswith(')'):
            try: data = json.loads(call[len('self.__next_f.push('):-1])
            except ValueError: raise ValueError('Non-JSON flight metadata; JavaScript is not executed')
            walk(data)
    unique_lists = {json.dumps(row, sort_keys=True, ensure_ascii=False): row for row in lists}
    if len(unique_lists) != 1 or not books:
        raise ValueError(f'Expected consistent public All list and metadata: {len(unique_lists)} distinct lists, {len(books)} books')
    listing = next(iter(unique_lists.values()))
    items = listing.get('itemListElement', [])
    if type(listing.get('numberOfItems')) is not int or listing['numberOfItems'] != len(items):
        raise ValueError('Public catalogue count mismatch')
    positions = [item.get('position') for item in items]
    if sorted(positions) != list(range(1, len(items)+1)): raise ValueError('Missing or duplicate public list position')
    linked = Counter((item.get('item',{}).get('url'), item.get('item',{}).get('name')) for item in items)
    observed = Counter((row['sourceUrl'], row['title']) for row in books.values())
    if linked != observed: raise ValueError('Public JSON-LD and serialized source metadata differ')
    rows = sorted(books.values(), key=lambda r: r['providerSourceId'])
    return {'summary': {'publicCatalogueRows': len(items), 'distinctProviderSourceIds': len(rows),
                        'metadataOccurrences': occurrences, 'structuredListCopies': len(lists),
                        'byMetadataBucket': dict(sorted(Counter(r['metadataBucket'] for r in rows).items())),
                        'byProviderRuleset': dict(sorted(Counter(r['providerRuleset']['name'] for r in rows).items()))},
            'records': rows}


def audit(folder):
    folder = Path(folder); capture = json.loads((folder/'capture.json').read_text(encoding='utf-8'))
    raw = (folder/'library.html').read_bytes()
    if (capture.get('url') != REQUEST_URL or capture.get('finalUrl') != LIBRARY_URL or capture.get('status') != 200
            or hashlib.sha256(raw).hexdigest() != capture.get('sha256') or capture.get('bytes') != len(raw)):
        raise ValueError('Public source URL/status/SHA mismatch')
    data = extract(raw.decode('utf-8'))
    return {'schemaVersion': 1, 'status': 'mixed-public-library-observations-not-2014-scope-acceptance',
            'accepted': False, 'complete': False, 'approvedDenominator': None,
            'capture': {k: capture[k] for k in ['url','finalUrl','status','sha256','bytes','retrievedAt']},
            'inputHashEncoding': 'UTF-8; CRLF normalized to LF; all other bytes preserved',
            'generator': {'path': 'scripts/audit-publisher-library-inventory.py', 'sha256': hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n', b'\n')).hexdigest()},
            **data,
            'limits': ['Public mixed-publisher/mixed-ruleset catalogue snapshot, not all WotC publications.',
                       'Displayed publisher, third-party flag and official-publication evidence are distinct.',
                       'Provider source IDs never replace dnd.su numeric IDs.',
                       'Provider release date is not inferred to be first printing or text version.',
                       'No account ownership/favorites, imagery, full rules, inclusion decisions or runtime data.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture_folder'); parser.add_argument('--output')
    args = parser.parse_args(); result = audit(args.capture_folder)
    if args.output: Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result['summary'], ensure_ascii=False))
