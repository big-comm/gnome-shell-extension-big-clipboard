"""Migrate activation before Shell starts. Never touch clipboard data or preferences."""
import json
import logging
import os
from pathlib import Path
import sys

LEGACY_UUID = 'copyous@boerdereinar.dev'
UUID = 'big-clipboard@communitybig.org'
KEYS = ('enabled-extensions', 'disabled-extensions')


def migrate_lists(enabled, disabled):
    """Keep explicit disablement, ordering, unrelated entries and empty lists."""
    def convert(values):
        return list(dict.fromkeys(UUID if value == LEGACY_UUID else value for value in values))
    # A removed Copyous can leave a stale disabled UUID behind.
    # The replacement's explicit state takes precedence over that old entry.
    if UUID in enabled and UUID not in disabled:
        disabled = [value for value in disabled if value != LEGACY_UUID]
    disabled_out = convert(disabled)
    enabled_out = convert(enabled)
    # GNOME gives disabled-extensions precedence over enabled-extensions.
    if UUID in disabled_out:
        enabled_out = [value for value in enabled_out if value != UUID]
    return enabled_out, disabled_out


def migrate(settings, backup_dir):
    before = tuple(list(settings.get_strv(key)) for key in KEYS)
    if LEGACY_UUID not in before[0] + before[1]:
        return False
    after = migrate_lists(*before)
    if not all(settings.is_writable(key) for key in KEYS):
        raise RuntimeError('Extension activation settings are locked')
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    backup = backup_dir / 'activation-before.json'
    try:
        with backup.open('x', encoding='utf-8') as stream:
            os.chmod(backup, 0o600)
            json.dump(dict(zip(KEYS, before)), stream)
    except FileExistsError:
        pass
    settings.delay()
    for key, values in zip(KEYS, after):
        if not settings.set_strv(key, values):
            settings.revert()
            raise RuntimeError(f'Cannot migrate {key}')
    settings.apply()
    return True


def run():
    from gi.repository import Gio, GLib
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    reply = bus.call_sync(
        'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
        'NameHasOwner', GLib.Variant('(s)', ('org.gnome.Shell',)),
        GLib.VariantType('(b)'), Gio.DBusCallFlags.NONE, 2000, None)
    if reply.unpack()[0]:
        raise RuntimeError('Refusing UUID migration while GNOME Shell is running')
    metadata = Path('/usr/share/gnome-shell/extensions') / UUID / 'metadata.json'
    if json.loads(metadata.read_text())['uuid'] != UUID:
        raise RuntimeError('Big Clipboard is not installed')
    state = Path(GLib.get_user_state_dir()) / 'big-clipboard' / 'migration'
    if migrate(Gio.Settings.new('org.gnome.shell'), state):
        Gio.Settings.sync()
        logging.info('Migrated Copyous activation to Big Clipboard')


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'gdm':
        return 0
    logging.basicConfig(level=logging.INFO)
    try:
        run()
    except Exception:
        logging.exception('Big Clipboard migration failed; Shell startup remains available')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
