import copy
import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('subclass_audit',Path(__file__).resolve().parents[1]/'scripts/audit-srd-subclass-reference.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
class SubclassAuditTests(unittest.TestCase):
 def fixture(self):
  data={'spellNames':{'spell-a':{'en':'Alpha Spell'},'spell-b':{'en':'Beta Spell'}},'subclasses':[{'id':'test-class','nameEn':'Test Class','sourcePage':1,'features':[{'key':'Test Feature','sourcePage':1}], 'spellTables':[{'name':'North','sourceHeading':'North','sourcePage':2,'rows':[{'level':3,'spellIds':['spell-a','spell-b']}]},{'name':'South','sourceHeading':'South','sourcePage':2,'rows':[{'level':5,'spellIds':['spell-a','spell-b']}]}]}]}
  return data,{1:'Test Class\nTest Feature',2:'North\n3rd Alpha Spell, Beta Spell\nSouth\n5th Alpha Spell, Beta Spell'}
 def test_good_source_and_normalized_pdf_spacing(self):
  data,pages=self.fixture();pages[2]=pages[2].replace('Alpha','Al pha').replace('Beta','Be\nta')
  report=audit.audit_reference(data,pages);self.assertEqual(report['errors'],[]);self.assertEqual(report['spellLinks'],4)
 def test_wrong_level_cannot_match_another_table_on_same_page(self):
  data,pages=self.fixture();data['subclasses'][0]['spellTables'][0]['rows'][0]['level']=5
  self.assertEqual(audit.audit_reference(data,pages)['errors'],['Table row: test-class/North/5'])
 def test_wrong_source_page_and_missing_heading_fail(self):
  data,pages=self.fixture();data['subclasses'][0]['features'][0]['sourcePage']=2
  self.assertIn('Feature heading/page: test-class/Test Feature',audit.audit_reference(data,pages)['errors'])
  data['subclasses'][0]['features'][0]['sourcePage']=3
  with self.assertRaisesRegex(ValueError,'Missing source page'):audit.audit_reference(data,pages)
 def test_wrong_order_or_changed_spell_is_not_a_valid_source_row(self):
  data,pages=self.fixture();data['subclasses'][0]['spellTables'][0]['rows'][0]['spellIds'].reverse()
  self.assertIn('Table row: test-class/North/3',audit.audit_reference(data,pages)['errors'])
  data,pages=self.fixture();data['spellNames']['spell-a']['en']='Invented Spell'
  self.assertEqual(len(audit.audit_reference(data,pages)['errors']),2)
if __name__=='__main__':unittest.main()
