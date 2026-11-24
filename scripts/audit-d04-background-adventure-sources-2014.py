"""Verify the selected D04 PDF sections from previously downloaded publisher copies."""

import argparse
import hashlib
import json
import runpy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'catalog/background-adventure-source-witnesses-2014.json'
SHARED = runpy.run_path(str(ROOT / 'scripts/audit-selected-rule-witnesses.py'))


def build(directory):
    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    if (contract['fullPrimaryRuleSectionsVerified'] is not False
            or contract['componentUnitsAccepted'] != 0
            or contract['complete'] is not False
            or contract['approvedDenominator'] is not None
            or contract['textReusePermission'] != 'not-established'):
        raise ValueError('Source witnesses cannot promote catalog acceptance')

    blobs = {}
    for source in contract['sources']:
        filename = source['file']
        if filename != Path(filename).name or not filename.endswith('.pdf'):
            raise ValueError('Expected a local PDF filename')
        data = (directory / filename).read_bytes()
        if len(data) != source['bytes'] or hashlib.sha256(data).hexdigest() != source['sha256']:
            raise ValueError('Source bytes differ: ' + source['id'])
        blobs[source['id']] = data

    import pypdfium2 as pdfium

    pages = {}
    for key, data in blobs.items():
        with pdfium.PdfDocument(data) as document:
            selected = [''] * len(document)
            for index in {unit['pdfPage'] - 1 for unit in contract['units'] if unit['source'] == key}:
                if not 0 <= index < len(document):
                    raise ValueError('Selected PDF page is outside the source: ' + key)
                page = document[index]
                textpage = page.get_textpage()
                try:
                    selected[index] = textpage.get_text_range()
                finally:
                    textpage.close()
                    page.close()
            pages[key] = selected

    return SHARED['audit'](contract, blobs, pages)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.directory), indent=2))


if __name__ == '__main__':
    main()
