import importlib.util
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, ArrayObject, NameObject, TextStringObject, NumberObject

SPEC = importlib.util.spec_from_file_location('sheet_layout', Path(__file__).resolve().parents[1] / 'scripts/audit-official-sheet-layout-80.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def fixture(shared=False, orphan=False, duplicate_name=False, cyclic=False):
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    owner = DictionaryObject({NameObject('/T'): TextStringObject('Example '), NameObject('/FT'): NameObject('/Tx'), NameObject('/V'): TextStringObject('')})
    owner_ref = writer._add_object(owner)
    widget = DictionaryObject({NameObject('/Subtype'): NameObject('/Widget'), NameObject('/Parent'): owner_ref, NameObject('/Rect'): ArrayObject([NumberObject(0), NumberObject(0), NumberObject(100), NumberObject(20)])})
    widget_ref = writer._add_object(widget)
    owner[NameObject('/Kids')] = ArrayObject([widget_ref])
    annotations = [widget_ref]
    roots = [] if orphan else [owner_ref]
    if shared:
        other = DictionaryObject(dict(widget)); other_ref = writer._add_object(other)
        owner['/Kids'].append(other_ref); annotations.append(other_ref)
    if duplicate_name:
        other_owner = DictionaryObject(dict(owner)); other_owner.pop('/Kids')
        other_ref = writer._add_object(other_owner); roots.append(other_ref)
        other_widget = DictionaryObject(dict(widget)); other_widget[NameObject('/Parent')] = other_ref
        annotations.append(writer._add_object(other_widget))
    if cyclic:
        widget[NameObject('/Parent')] = widget_ref
    page[NameObject('/Annots')] = ArrayObject(annotations)
    form = writer._add_object(DictionaryObject({NameObject('/Fields'): ArrayObject(roots)}))
    writer.root_object[NameObject('/AcroForm')] = form
    output = BytesIO(); writer.write(output); output.seek(0)
    return PdfReader(output)


class OfficialSheetLayoutTest(unittest.TestCase):
    def test_shared_widgets_preserve_one_logical_parent(self):
        result = M.inventory(fixture(shared=True))
        self.assertEqual(len(result['canonical']), 1)
        self.assertEqual(len(result['rows']), 2)
        self.assertEqual(len(result['repeatedOwnerGroups']), 1)
        self.assertEqual(result['ambiguousNames'], [])

    def test_separate_same_name_fields_are_not_merged(self):
        result = M.inventory(fixture(duplicate_name=True))
        self.assertEqual(len(result['canonical']), 2)
        self.assertEqual(result['ambiguousNames'], ['Example '])
        self.assertEqual(len(result['rows']), 2)

    def test_trailing_space_and_blank_are_not_normalized_away(self):
        row = M.inventory(fixture())['rows'][0]
        self.assertEqual(row['fieldName'], 'Example ')
        self.assertTrue(row['valueIsBlank'])
        self.assertEqual(row['fieldType'], '/Tx')

    def test_orphan_widget_is_not_silently_attached(self):
        with self.assertRaisesRegex(ValueError, 'absent'):
            M.inventory(fixture(orphan=True))

    def test_widget_parent_cycle_fails(self):
        with self.assertRaisesRegex(ValueError, 'Cyclic'):
            M.inventory(fixture(cyclic=True))

    def test_other_pdf_is_rejected_before_parsing(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'unrelated.pdf'; path.write_bytes(b'not a public form')
            with self.assertRaisesRegex(ValueError, 'SHA mismatch'):
                M.audit(path)


if __name__ == '__main__':
    unittest.main()
