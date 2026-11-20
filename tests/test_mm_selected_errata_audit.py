import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-mm-selected-errata.py'))
DATA=json.loads((ROOT/'catalog/mm-selected-errata-parameters-2014.json').read_text(encoding='utf-8'))
SCOPE=json.loads((ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8'))
# Independent minimal factual extracts, not a copy of the source PDF.
SECTIONS={
 'Acolyte':'Senses: passive Perception 12 [was 10].',
 'Cult Fanatic':'Senses: passive Perception 11 [was 10].',
 'Noble':'Senses: passive Perception 12 [was 10].',
 'Priest':'Speed: 30 ft. [was 25 ft.]. Skills: Religion +5 [was +4].',
 'Veteran':'Heavy crossbow: 6 (1d10 + 1) damage [was 1d10].',
 'Guard':'Spear: 5 (1d8 + 1) piercing damage if used with two hands to make a melee attack.',
 'Druid':'Quarterstaff: 6 (1d8 + 2) damage with shillelagh [was 1d8].',
 'Assassin':'Saving throws: Dex +6, Int +4. Skills: Acrobatics +6, Deception +3, Perception +3, Stealth +9. Senses: passive Perception 13. Sneak Attack: Avg. damage is 14. Shortsword and light crossbow: +6 to hit.',
 'Night Hag':'Innate spellcasting: spell save DC 14, +6 to hit with spell attacks. Claws: +7 to hit.',
 'Gynosphinx':'Skills: Arcana +12, History +12, Perception +8, Religion +8. Senses: passive Perception 18. Spellcasting: spell save DC 16, +8 to hit with spell attacks. Claw: +8 to hit. Teleport: up to 120 feet [was 12 feet].'}
def pages():
    result=['','']
    for name,(book,pdf) in m['LOCATORS'].items():result[pdf-1]+=f'{name} (p. {book}). {SECTIONS[name]}\n'
    return result
class SelectedErrataTests(unittest.TestCase):
 def test_real_manifest_matches_independently_specified_selected_values(self):
    self.assertEqual(m['audit'](DATA,m['sections'](pages()),SCOPE),(10,36))
 def test_conditions_cannot_disappear(self):
    for name,old,new in [('Guard','two hands','one hand'),('Guard','melee','ranged'),('Druid','with shillelagh','without a spell')]:
      with self.assertRaises(ValueError):m['parse_fields'](name,SECTIONS[name].replace(old,new))
 def test_old_value_is_not_mistaken_for_current(self):
    s=SECTIONS['Gynosphinx'].replace('up to 120 feet','up to 12 feet')
    d=dict(SECTIONS,Gynosphinx=s)
    with self.assertRaises(ValueError):m['audit'](DATA,d,SCOPE)
 def test_duplicate_or_missing_heading_and_wrong_page_fail(self):
    p=pages();p[0]+='Acolyte (p. 342). Senses: passive Perception 12.'
    with self.assertRaises(ValueError):m['sections'](p)
    p=pages();p[0]=p[0].replace('Acolyte (p. 342).','Wrong Creature (p. 342).')
    with self.assertRaises(ValueError):m['sections'](p)
    with self.assertRaises(ValueError):m['sections'](pages()[::-1])
 def test_pdf_line_break_hyphenation(self):
    p=pages();p[0]=p[0].replace('shillelagh','shille-\nlagh')
    self.assertEqual(m['audit'](DATA,m['sections'](p),SCOPE),(10,36))
 def test_same_name_background_cannot_replace_creature(self):
    d=copy.deepcopy(DATA);d['records'][0]['observationId']='dndsu:backgrounds:766'
    with self.assertRaises(ValueError):m['audit'](d,SECTIONS,SCOPE)
 def test_incorrect_secondary_status_and_promotions_fail(self):
    for modify in [lambda d:d.update(accepted=True),lambda d:d['records'][0].update(fullStatBlockCompared=True),lambda d:d['records'][0]['observedSelectedFields'].update(passivePerception=10),lambda d:d['records'][0].update(canonicalId='x'),lambda d:d['records'].pop()]:
      d=copy.deepcopy(DATA);modify(d)
      with self.assertRaises(ValueError):m['audit'](d,SECTIONS,SCOPE)
 def test_duplicate_parameter_is_not_silently_selected(self):
    with self.assertRaises(ValueError):m['parse_fields']('Acolyte',SECTIONS['Acolyte']+' passive Perception 12')
 def test_audit_keeps_inputs_unchanged(self):
    before=copy.deepcopy(DATA);m['audit'](DATA,SECTIONS,SCOPE);self.assertEqual(DATA,before)
if __name__=='__main__':unittest.main()
