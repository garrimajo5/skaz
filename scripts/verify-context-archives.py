"""Read-only archive verification; Python standard library and local Git only."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'docs/archive/context-history-2026-11-21.json').read_text(encoding='utf-8'))
for entry in manifest:
    original = subprocess.check_output(['git', 'show', f"{entry['commit']}:{entry['source']}"], cwd=root)
    # Git may check Markdown out as CRLF; compare the archived Git blob if tracked,
    # otherwise the new file bytes before its first add.
    archive = subprocess.run(['git', 'show', f":{entry['archive']}"], cwd=root, capture_output=True)
    archived = archive.stdout if archive.returncode == 0 else (root / entry['archive']).read_bytes()
    if archived != original or hashlib.sha256(archived).hexdigest() != entry['sha256']:
        raise SystemExit(f"Archive mismatch: {entry['archive']}")
    if (root / entry['archive']).read_text(encoding='utf-8') != original.decode('utf-8').replace('\r\n', '\n'):
        raise SystemExit(f"Working tree archive mismatch: {entry['archive']}")
    if len(original) != entry['bytes'] or len(original.decode('utf-8')) != entry['characters']:
        raise SystemExit(f"Manifest size mismatch: {entry['source']}")
    current = (root / entry['source']).read_text(encoding='utf-8')
    print(json.dumps({'file': entry['source'], 'archiveExact': True,
                      'originalCharacters': entry['characters'], 'currentCharacters': len(current),
                      'reductionPercent': round(100 * (1 - len(current) / entry['characters']), 2)}))
