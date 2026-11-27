"""Record the boundaries of three Artificer answers in Oracle of War v1.5."""

import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
import unicodedata

from pypdf import PdfReader

SOURCES = {
    "oracle-player-guide.pdf": {
        "url": "https://media.wizards.com/2021/dnd/downloads/OracleofWar_PGv1_5.pdf",
        "sha256": "13fae64ffcc255f800b99e333d3b56d32db38e588d180c5e5aa2562aa7e19f3c",
        "page": 8,
        "guide": "player",
        "part": 4,
        "versionEnd": None,
    },
    "oracle-dm-guide.pdf": {
        "url": "https://media.wizards.com/2021/dnd/downloads/OracleofWar_DMGv1_5.pdf",
        "sha256": "162224dcdac296c9456a20f6a4936abce7f4c8511f84f45c66ef262ee1ff2d06",
        "page": 5,
        "guide": "dm",
        "part": 3,
        "versionEnd": "at 10th level artificers",
    },
}
REGIONS = {
    "publication-choice": {
        "start": "the artificer presented in",
        "sha256": "325f1254fc1550b3b738d18b34ec07e89076a97745dbeee25d260df41433f831",
        "facts": {"preferredSourceId": "117", "errataUpdatesSourceId": "119"},
    },
    "campaign-infusions": {
        "start": "do artificer infusions",
        "end": "how do greater aberrant",
        "sha256": "95561f021bbd67984c5b506895c35219b26dc3977190cac9cfa12eb45c26b0ab",
        "facts": {
            "excludedFromCampaignMagicItemLimit": True,
            "endsAtAdventureEndUnlessWaived": True,
            "mayInfuseAgainNextAdventure": True,
            "waiverRequiresSameCharactersAndDmAcrossConsecutiveAdventures": True,
            "waiverAtDmDiscretion": True,
        },
    },
    "wayfinder-eligibility": {
        "start": "what about wayfinder",
        "end": "do artificer infusions",
        "sha256": "67b990070ef58a2c77ee98ee1300f391b60ef5ad63fc432aa3d251aac23c26cf",
        "facts": {"eligibleInCampaignOnlyForExactMatchWithSourceId": "119"},
    },
}


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def normalize(text):
    expanded = unicodedata.normalize("NFKC", text).replace("’", "'")
    return " ".join(expanded.split()).casefold()


def select_region(text, start, end):
    if text.count(start) != 1 or (end is not None and text.count(end) != 1):
        raise ValueError("FAQ region must have one start and at most one designated end")
    start_index = text.index(start)
    end_index = text.index(end) if end is not None else len(text)
    if end_index <= start_index:
        raise ValueError("FAQ region ends before it starts")
    return text[start_index:end_index].strip()


def inspect_capture(folder, filename, pin, receipt):
    raw = (folder / filename).read_bytes()
    if (
        receipt["requestedUrl"] != pin["url"]
        or receipt["finalUrl"] != pin["url"]
        or receipt["status"] != 200
        or receipt["outcome"] != "complete"
        or receipt["bodyFile"] != filename
        or receipt["bytes"] != len(raw)
        or receipt["sha256"] != pin["sha256"]
        or sha256(raw) != pin["sha256"]
    ):
        raise ValueError(f"Official capture does not match its pin: {filename}")
    pdf = PdfReader(BytesIO(raw))
    if len(pdf.pages) != pin["page"]:
        raise ValueError(f"Unexpected page count: {filename}")

    text = normalize(pdf.pages[pin["page"] - 1].extract_text())
    if (
        f"{pin['guide']}'s guide v1.5 {pin['page']}" not in text
        or f"part {pin['part']}: faq" not in text
        or "not for resale" not in text
        or "personal use" not in text
    ):
        raise ValueError(f"Unexpected FAQ page or footer: {filename}")

    witness_hashes = {}
    for key, region in REGIONS.items():
        end = pin["versionEnd"] if key == "publication-choice" else region["end"]
        fragment = select_region(text, region["start"], end)
        digest = sha256(fragment.encode("utf-8"))
        if digest != region["sha256"]:
            raise ValueError(f"Unexpected content of {key} in {filename}")
        witness_hashes[key] = digest

    return {
        **{key: receipt[key] for key in ("requestedUrl", "finalUrl", "status", "bytes", "sha256", "capturedAt")},
        "guide": pin["guide"],
        "version": "1.5",
        "pdfPageCount": len(pdf.pages),
        "faqPage": pin["page"],
        "faqPart": pin["part"],
        "rightsEvidence": "publisher footer permits personal-use printing and copying",
        "normalizedRegionSha256": witness_hashes,
    }


def audit(folder):
    folder = Path(folder)
    captures = json.loads((folder / "capture.json").read_text(encoding="utf-8"))
    sources = {
        filename: inspect_capture(folder, filename, pin, captures[filename])
        for filename, pin in SOURCES.items()
    }
    return {
        "schemaVersion": 1,
        "ruleset": "5e-2014",
        "campaign": "Oracle of War",
        "campaignGuideVersion": "1.5",
        "sources": sources,
        "witnesses": {key: region["facts"] for key, region in REGIONS.items()},
        "limits": {
            "campaignSpecific": True,
            "sameWitnessInBothGuides": True,
            "globalPublicationEquivalenceEstablished": False,
            "spellSlotRoundingVerified": False,
            "automaticGrantOrRemoval": False,
            "createsCatalogRecords": False,
            "redistributionPermissionEstablished": False,
        },
    }


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("capture_directory", type=Path)
    cli.add_argument("--output", required=True, type=Path)
    args = cli.parse_args()
    report = audit(args.capture_directory)
    args.output.write_bytes((json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
