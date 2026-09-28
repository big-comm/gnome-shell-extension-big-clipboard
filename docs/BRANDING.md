# Big Clipboard identity — phase 1

2026-09-28. Visible identity only. Package/repository renaming remains pending.

Changed: extension metadata, notification/indicator/preferences name (metadata consumers), diagnostic prefix, HTTP user agent, gettext project headers, package description and README captures. Preserve upstream credits and artwork attribution.

Unchanged: Arch package name, UUID, schema IDs/paths, gettext domain, resource paths, D-Bus interface, database format/location and BGC references. Existing commands still use Copyous identifiers.

## Validation

- TypeScript, paging/preview/shader tests, lint and release ZIP build passed.
- Metadata compatibility fields and schema/settings/database code unchanged.
- Gettext extraction/catalog comparison passed. `msgfmt --check` finds a pre-existing Turkish plural-header mismatch; reproduced from the parent revision. Other catalogs pass.
- GNOME 50.4 and 51.0: installed ZIP, fresh login, active extension named Big Clipboard. Preferences window title, indicator accessible name and notification source match.
- Settings dump unchanged across installation/login on both VMs.
- GNOME 50: all 21 existing database rows preserved. GNOME 51 baseline database empty. Shared clipboard added one row on each VM; this is not an exact database-byte comparison.
- Legacy D-Bus Show/Hide passed on both VMs.
- 1000 synthetic mixed entries: 12 initial cards, image previews, search for entry 999, closing/reopening passed on both VMs.
- README images captured from the VMs with synthetic entries. Test helper disabled and capture settings restored afterward. VM viewers left open.

The old temporary stress database had disappeared at VM reboot. Before testing, backed up settings/history and selected the existing default history database. Backups remain under `~/.local/state/big-clipboard-brand-audit/` in each VM.

## Next phase

Rename the distribution package with explicit dependency/replacement metadata and test upgrades from the old package. Decide and test any UUID/settings/data migration separately. Keep compatibility until that path is verified in both GNOME versions.
