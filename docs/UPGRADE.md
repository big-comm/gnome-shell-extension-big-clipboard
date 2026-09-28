# Big Clipboard package migration

2026-09-28. Package: `gnome-shell-extension-big-clipboard`.

## Compatibility

- `provides`, `conflicts` and `replaces`: `gnome-shell-extension-copyous`. Keep epoch 1. A repository system upgrade replaces the old package; `provides` also satisfies existing Big Gnome Center dependencies.
- Preserve UUID `copyous@boerdereinar.dev`, settings schema/path, gettext domain, data directory, database format and D-Bus interface. No history relocation or UUID migration.
- User-installed extensions under `~/.local/share/gnome-shell/extensions` override system packages. Back up and remove an old override before expecting the packaged code to run.
- Log out and back in after installation. GNOME caches extension modules in the running Shell; toggling an extension does not reliably replace loaded JavaScript.
- Repository and local directory: `gnome-shell-extension-big-clipboard`. The PKGBUILD fetches `main`; local commits must reach that branch before remote package builds include them.

## Bundled highlighting

Highlight.js 11.11.1 is pinned in the pnpm lockfile. The build verifies SHA-512 for the core and 192 language modules against the manifest in `constants.ts`, then packages the ESM files and BSD license. There is no preferences download/install action.

The 36 common languages load by default. Additional languages are enabled through preferences and loaded from local package files. Existing downloaded-language selections are honored until explicitly changed. Each extension activation creates a fresh engine; disabled optional languages cannot leak from a cached module.

## Localization

Regenerated gettext catalogs; completed Brazilian Portuguese: 399 translated messages, none fuzzy or untranslated. Fixed the Turkish plural header to match its two-form entries and gettext's `tr_TR` rule. Package checks now fail on invalid catalogs.

Remaining untranslated messages: de 12, fr 29, it 29, pl 7, ru 58, tr 25, zh_CN 29. These locales retain their translations and English fallback; they are not claimed complete.

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
