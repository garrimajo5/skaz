import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))
# Independently captured public index fields. No full stat blocks or images.
TRANSCRIPT='''Assassin Bug|588524-assassin-bug|3|Monstrosity|Medium|Neutral
Blindheim|588546-blindheim|2|Humanoid (blindheim)|Medium|Chaotic Neutral
Crab Folk|588563-crab-folk|3|Giant|Large|Neutral
Dire Corby|588585-dire-corby|1/2|Humanoid (dire corby)|Medium|Neutral Evil
Eye of Fear and Flame|581278-eye-of-fear-and-flame|9|Undead|Medium|Chaotic Evil
Fog Giant|588647-fog-giant|11|Giant|Huge|Neutral Evil
Forlarren|588617-forlarren|3|Fey|Medium|Chaotic Neutral
Jermlaine|588939-jermlaine|1/8|Humanoid (jermlaine)|Tiny|Neutral Evil
Khargra|588950-khargra|1/8|Elemental|Small|Neutral
Killmoulis|588967-killmoulis|0|Fey|Tiny|Neutral
Mite|588989-mite|1/4|Fey|Small|Lawful Evil
Needle Lord|589010-needle-lord|3|Plant|Large|Chaotic Evil
Needle Spawn|589001-needle-spawn|1/2|Plant|Medium|Chaotic Evil
Norker|589016-norker|1/2|Humanoid (goblinoid)|Small|Chaotic Evil
Norker War Leader|589025-norker-war-leader|3|Humanoid (goblinoid)|Small|Chaotic Evil
Screaming Devilkin|589036-screaming-devilkin|1|Fey|Small|Lawful Evil
Xill|589081-xill|3|Monstrosity|Medium|Lawful Evil
Ygorl, Lord of Entropy|589066-ygorl-lord-of-entropy|23|Aberration|Large|Chaotic Neutral'''
def fixture():
    parts=['<select><option id="filter-source-mordenkainens-fiendish-folio-volume-1" value="57" selected>Folio</option></select><ul class="rpgmonster-listing">']
    for line in TRANSCRIPT.splitlines():
        name,slug,cr,kind,size,alignment=line.split('|')
        source='Infernal Machine Rebuild' if name=='Eye of Fear and Flame' else "Mordenkainen&#x27;s Fiendish Folio Volume 1"
        parts.append(f'<div class="info" data-type="monsters"><div class="monster-name"><a href="/monsters/{slug}">{name}</a><span class="source">{source}</span></div><div class="monster-challenge"><span>{cr}</span></div><div class="monster-type">{kind}</div><div class="monster-size">{size}</div><div class="monster-alignment">{alignment}</div></div>')
    return ''.join(parts)+'</ul>'
class FolioIndexTests(unittest.TestCase):
    def test_all_public_rows_match_and_preserve_cross_source_display(self):
        d=json.loads((ROOT/'catalog/fiendish-folio-version-evidence-2014.json').read_text(encoding='utf-8'))
        rows=m['parse_index'](fixture());self.assertEqual(m['audit'](d,rows),18)
        self.assertEqual(sum(r['displayedSource']=='Infernal Machine Rebuild' for r in rows),1)
    def test_missing_filter_or_page_rejected(self):
        for value in [fixture().replace(' selected',''),fixture().replace('value="57"','value="58"'),fixture()+'<a rel="next" href="?page=2">2</a>',fixture()+'<a href="?page=2">Next</a>']:
            with self.assertRaises(ValueError):m['parse_index'](value)
    def test_foreign_source_missing_cr_or_duplicate_url_rejected(self):
        for value in [fixture().replace('Infernal Machine Rebuild','Monster Manual'),fixture().replace('<span>1/8</span>','<span></span>',1),fixture().replace('588546-blindheim','588524-assassin-bug')]:
            with self.assertRaises(ValueError):m['parse_index'](value)
    def test_row_count_and_field_changes_fail_audit(self):
        rows=m['parse_index'](fixture());d=json.loads((ROOT/'catalog/fiendish-folio-version-evidence-2014.json').read_text(encoding='utf-8'))
        with self.assertRaises(ValueError):m['audit'](d,rows[:-1])
        rows[0]['challengeRating']='4'
        with self.assertRaises(ValueError):m['audit'](d,rows)
    def test_second_listing_and_hidden_duplicate_fields_fail(self):
        for value in [fixture()+fixture(),fixture().replace('<span>3</span>','<span>3</span><div class="monster-challenge">3</div>',1)]:
            with self.assertRaises(ValueError):m['parse_index'](value)
