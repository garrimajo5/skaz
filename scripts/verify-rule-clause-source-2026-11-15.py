"""Verify the two repaired clauses against the pinned, local CC BY SRD PDF.

Usage: python scripts/verify-rule-clause-source-2026-11-15.py PATH_TO_SRD_PDF
No download, catalog mutation or loose PDF-version matching.
"""
import hashlib
import re
import sys
from pathlib import Path
from pypdf import PdfReader

path = Path(sys.argv[1])
if hashlib.sha256(path.read_bytes()).hexdigest() != '2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0':
    raise ValueError('Unexpected SRD PDF hash')
reader = PdfReader(path)
checks = [
    (190, 'Wall of Force', None, [r'shape a flat surface', r'Each panel must be contiguous with another panel']),
    (149, 'Globe of Invulnerability', 'Glyph of Warding', [r'can target creatures and objects within the barrier', r'the spell has no effect on them']),
]
for page, heading, end, patterns in checks:
    text = re.sub(r'\s+', ' ', reader.pages[page - 1].extract_text())
    if text.count(heading) != 1:
        raise ValueError(f'Ambiguous source heading on page {page}')
    block = text.split(heading, 1)[1]
    if end:
        if end not in block:
            raise ValueError(f'Missing end heading on page {page}')
        block = block.split(end, 1)[0]
    for pattern in patterns:
        if not re.search(pattern, block):
            raise ValueError(f'Clause missing from {heading}: {pattern}')
print('Verified 4 source anchors in 2 spell blocks; SRD SHA-256 matches.')
