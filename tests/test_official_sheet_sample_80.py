import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('sheet_sample', Path(__file__).resolve().parents[1] / 'scripts/build-official-sheet-sample-80.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class OfficialSheetSampleTest(unittest.TestCase):
    def test_existing_output_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            marker = Path(folder) / 'keep.txt'; marker.write_text('original')
            with self.assertRaises(FileExistsError):
                M.build('not-read.pdf', folder)
            self.assertEqual(marker.read_text(), 'original')

    def test_wrong_source_cannot_create_output(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'unrelated.pdf'; source.write_bytes(b'not the public template')
            target = Path(folder) / 'output'
            for layout in ('standard', 'alternative'):
                with self.subTest(layout=layout):
                    with self.assertRaisesRegex(ValueError, 'SHA mismatch'):
                        M.build(source, target, layout=layout)
                    self.assertFalse(target.exists())

    def test_missing_canonical_value_is_not_accepted_from_appearance_alone(self):
        class Reader:
            def get_fields(self):
                return {name: {'/V': value} for name, value in M.VALUES.items() if name != 'HPCurrent'}
        with self.assertRaisesRegex(ValueError, 'Canonical.*HPCurrent'):
            M.verify_values(Reader())


if __name__ == '__main__':
    unittest.main()
