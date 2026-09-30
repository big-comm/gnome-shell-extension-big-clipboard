"""Activation migration is lossless, disabled-aware and repeatable."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('migration', Path(__file__).resolve().parents[1] / 'scripts/migrate-uuid.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Settings:
    def __init__(self, enabled, disabled, writable=True, fail=None):
        self.values = dict(zip(m.KEYS, [enabled, disabled]))
        self.pending = {}
        self.writable = writable
        self.fail = fail
        self.applied = 0
    def get_strv(self, key): return list(self.values[key])
    def is_writable(self, key): return self.writable
    def delay(self): self.pending = {}
    def set_strv(self, key, values):
        self.pending[key] = values
        return key != self.fail
    def apply(self):
        self.values.update(self.pending)
        self.applied += 1
    def revert(self): self.pending = {}


class MigrationTests(unittest.TestCase):
    def test_enabled_disabled_conflicts_and_duplicates(self):
        for enabled, disabled, expected in [
            ([m.LEGACY_UUID, 'other'], [], ([m.UUID, 'other'], [])),
            ([], [m.LEGACY_UUID], ([], [m.UUID])),
            ([m.LEGACY_UUID], [m.LEGACY_UUID], ([], [m.UUID])),
            ([m.LEGACY_UUID, m.UUID], [], ([m.UUID], [])),
            ([m.UUID], [m.LEGACY_UUID], ([], [m.UUID])),
            ([m.LEGACY_UUID], [m.UUID], ([], [m.UUID])),
            (['other'], ['disabled'], (['other'], ['disabled'])),
            ([], [], ([], [])),
        ]:
            with self.subTest(enabled=enabled, disabled=disabled):
                self.assertEqual(m.migrate_lists(enabled, disabled), expected)
                self.assertEqual(m.migrate_lists(*expected), expected)

    def test_backup_and_repeat_preserve_original(self):
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp)/'migration'
            settings = Settings([m.LEGACY_UUID, 'other'], ['disabled'])
            self.assertTrue(m.migrate(settings, state))
            backup = (state/'activation-before.json').read_bytes()
            self.assertIn(m.LEGACY_UUID.encode(), backup)
            self.assertFalse(m.migrate(settings, state))
            self.assertEqual(settings.applied, 1)
            self.assertEqual((state/'activation-before.json').read_bytes(), backup)
            self.assertEqual((state/'activation-before.json').stat().st_mode & 0o777, 0o600)

    def test_never_enables_clean_install(self):
        with tempfile.TemporaryDirectory() as temp:
            self.assertFalse(m.migrate(Settings([], []), Path(temp)/'migration'))
            self.assertEqual(list(Path(temp).iterdir()), [])

    def test_locked_settings_and_failed_write_are_unchanged(self):
        for writable, fail in [(False, None), (True, m.KEYS[1])]:
            with tempfile.TemporaryDirectory() as temp:
                settings = Settings([m.LEGACY_UUID], ['other'], writable, fail)
                with self.assertRaises(RuntimeError): m.migrate(settings, Path(temp))
                self.assertEqual(settings.values, dict(zip(m.KEYS, [[m.LEGACY_UUID], ['other']])))
                self.assertEqual(settings.applied, 0)


if __name__ == '__main__':
    unittest.main()
