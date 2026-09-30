# Big Clipboard package migration

2026-09-28. Package: `gnome-shell-extension-big-clipboard`.

## Compatibility

- `provides`, `conflicts` and `replaces`: `gnome-shell-extension-copyous`. Keep epoch 1. A repository system upgrade replaces the old package; `provides` also satisfies existing Big Gnome Center dependencies.
- UUID: `big-clipboard@communitybig.org`. Before Shell startup, the package maps the old UUID in enabled/disabled lists, deduplicates entries and preserves explicit disablement. It leaves the global extension switch unchanged. It refuses migration while Shell is running and skips GDM.
- Preserve settings schema/path, gettext domain, data/config/cache directories, database format and D-Bus interface. Storage uses the fixed legacy ID `copyous@boerdereinar.dev`, independently of the new UUID. Default SQLite/JSON history, image URIs, custom database locations and `actions.json` stay in place; no copy, deletion or reset is needed.
- The package removes the old system extension directory. An upstream user installation may remain on disk; migration removes its activation. Do not manually enable both extensions. Big Clipboard refuses activation while the legacy extension is active or transitioning.
- Big Gnome Center migrates saved activation lists through its locked persistence store. All six bundled layouts use the new UUID; old saved layouts are normalized when applied. Both UUIDs share the protected clipboard settings subtree during upgrades.
- Manual ZIP installs do not install the pre-session migration hook. Disable Copyous, log out, then enable the new UUID after logging in. Existing data paths remain compatible.
- User-installed extensions with the new UUID override the system package. Back up and remove an outdated new-UUID override before expecting the packaged code to run. The old UUID does not shadow the renamed extension.
- Log out and back in after installation. GNOME caches extension modules in the running Shell; toggling an extension does not reliably replace loaded JavaScript.
- Repository and local directory: `gnome-shell-extension-big-clipboard`. The PKGBUILD fetches `main`; local commits must reach that branch before remote package builds include them.

## Bundled highlighting

Highlight.js 11.11.1 is pinned in the pnpm lockfile. The build verifies SHA-512 for the core and 192 language modules against the manifest in `constants.ts`, then packages the ESM files and BSD license. There is no preferences download/install action.

The 36 common languages load by default. Additional languages are enabled through preferences and loaded from local package files. Existing downloaded-language selections are honored until explicitly changed. Each extension activation creates a fresh engine; disabled optional languages cannot leak from a cached module.

## Localization

All eight gettext catalogs contain 399 translated messages, with no fuzzy or untranslated entries. Sonnet 5 completed the remaining 189 messages in German, French, Italian, Polish, Russian, Turkish and Simplified Chinese; existing translations were preserved. Placeholder, compiled-catalog and plural checks passed. The Italian plural rule now treats zero as plural.

Brazilian Portuguese was already complete. Technical names such as SQLite, JSON and Yaru remain unchanged. Package checks reject invalid catalogs. GJS on GNOME 50.4 and 51.0 loaded all eight compiled catalogs correctly, including plural lookups at 0, 1, 2, 5, 11, 21 and 101.

## Validation

- TypeScript, ESLint/Prettier, paging, preview lifecycle, GNOME shader compatibility and Highlight.js tests passed. Verified all 192 module hashes/imports and optional-language isolation.
- Gettext extraction, catalog comparison and `msgfmt --check` passed for all eight locales.
- Built test packages from the working source using the production `package()` function. The old-name baseline used the compatible BigCommunity fork before this change. These were local unsigned packages, not a published repository build.
- GNOME 50.4 and 51.0: a local pacman repository successfully replaced the old package through `-Syu`. Existing old-name dependencies remained satisfied. After a fresh login, package path, settings dump, 120 SQLite rows, 24 pins and 40 PNG hashes matched the baseline.
- Both VMs: full Unicode text copy, image-byte checksum, pin/unpin, full-history search, 120-card paging, optional language toggles and disable/enable passed. Bundled JavaScript and Ada highlighting also passed under GJS in a network namespace without network access.

Layout testing exposed an existing BGC issue: original profiles reapplied a 70-item retention limit. The accompanying BGC fix preserves live clipboard preferences before writing either layout settings or the persistent snapshot. Package migration alone does not fix older BGC layout application code.

With that BGC fix installed, both VMs passed BigGnome → Desk UX → Hybrid → G-Unity → Classic → Minimal with 120 entries and 12 initial cards in every layout. SQL and image hashes remained identical. Preferences retained their values; opening preferences performed the existing deprecated `paste-on-copy` → `swap-copy-shortcut` migration.

The VM journal contained unrelated environment warnings: Big Shot's installed GNOME 51 override uses the removed `St.BoxLayout.vertical` property; GTK4 desktop icons are unavailable on that VM. GNOME 50 logged one framebuffer-size assertion during a transition. This clipboard validation is not a clean bill of health for every installed extension.

Preferences opened in Brazilian Portuguese without the former install dialog. The language page and Ada switch were exercised through the real GTK accessibility interface on both VMs; the switch updated the selection successfully.

A final fresh login after all six layouts retained the fixture and settings. Super+V opened 12 cards from all 120 stored entries on both VMs. Original user preferences/history were restored after testing; the new package and BGC retention fix remain installed. Test backups remain under `~/.local/state/big-clipboard-package-audit/` in each VM.

## UUID migration validation

The subsequent UUID migration was tested on GNOME 50.4 and 51.0 with freshly built packages and real session restarts:

- Old-name package replacement and already-renamed package upgrade passed. Enabled and explicitly disabled activation survived login; a legacy user extension remained on disk without activation. Repeated migration, global disablement and empty lists passed with real Gio settings.
- Each VM retained 120 entries, 24 pins, 40 image hashes, custom actions, JSON history and the exact clipboard settings dump. SQLite used the default path on one VM and a custom path containing spaces on the other.
- All six layouts passed on both VMs. Legacy-UUID saved layouts activated the replacement and persisted the new UUID. Exact SQL and file hashes remained unchanged.
- Unicode text/image copying, pin/unpin, full-history search, pagination, optional highlighting, default JSON storage, preferences, Super+V and the existing D-Bus interface passed.
- Original VM histories and preferences were restored and verified afterward. Test fixtures and backups remain outside the packages; VM viewers remain open.
- Full BGC package check: 1,735 passed. Clipboard type checking, lifecycle/paging/storage tests, migration tests, release build and gettext checks passed.

This validates clipboard migration; unrelated installed-extension warnings remain as documented above.
