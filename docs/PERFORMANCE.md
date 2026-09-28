# Copyous performance audit

## Scope

- Preserve upstream history, UUID, settings schema, D-Bus API and clipboard database format.
- Keep the first 12 cards ready. Append 12 on demand while scrolling; End loads remaining matches in bounded idle batches.
- Search the full model, including entries without actors. Copy full content; limit only text/code previews to 4096 characters.
- Defer image metadata and textures until near the viewport. Cancel pending work when cards are destroyed.
- Disconnect card callbacks and guard asynchronous extension work across disable/enable.
- Support GNOME 50 and 51 shader, input backend and button-mask APIs.

## VM validation — 2026-09-28

GNOME 50.4 and 51.0, QEMU/KVM. Viewers remained open. Synthetic content only.
Times measure the first stage paint after `Show`, not completion of the opening animation.
Five invocations per case. Results depend on VM rendering and host load.

| History | GNOME | First paint | Subsequent paints | Initial cards |
| --- | --- | --- | --- | --- |
| Original, 1000 text entries | 50.4 | 2689 ms | 1294–1873 ms | 1000 |
| Optimized, 1000 mixed entries | 50.4 | 142 ms | 52–81 ms | 12 |
| Optimized, 1000 mixed entries | 51.0 | 218 ms | 97–139 ms | 12 |
| Optimized, 10000 text entries | 50.4 | 172 ms | 49–98 ms | 12 |
| Optimized, 10000 text entries | 51.0 | 217 ms | 104–166 ms | 12 |

The original source could not enable on GNOME 51 because `Shell.GLSLEffect` and the old input backend API were removed. No baseline timing exists for 51.
The mixed fixture contains text, code and 333 distinct PNG files. Only three image previews were loaded for its initial viewport.

Passed on both VMs:

- Repeated open/close; exactly 12 initial cards, including search reset during unmap.
- Scroll to the next page; 24 cards.
- Search the last of 1000 entries; empty search result; clear search.
- Copy 7018-character text without truncation; copied PNG SHA-256 matches its source.
- Pin/unpin, deletion, horizontal/vertical scrolling, light/dark appearance.
- Load 1000 mixed entries from an isolated SQLite database; 12 initial cards.
- BigGnome → Desk UX → Hybrid → G-Unity → Classic → Minimal → saved G-Unity. Copyous opened with 12 cards after every transition; clock placement and power-action policy also passed. [Results](layout-validation.json).

Raw measurements: [performance-results.json](performance-results.json).

## Limits

Entry metadata is still loaded into memory at startup. SQLite/Gda 6 queries remain synchronous inside scheduled work; database paging is a separate change.
Paging limits initial actors, not all actors after scrolling through the entire history. Closing prunes back to the first page.
GNOME 48/49 remain declared upstream targets but were not exercised in these VMs.
VM logs also contain unrelated Big Shot errors on GNOME 51 (`StBoxLayout.vertical`), unavailable DING, and compositor/shader warnings without a Copyous stack. These were not treated as Copyous passes or fixed here.
No claim of exhaustive correctness or zero latency.

## Local checks

`pnpm exec tsc --noEmit`, `pnpm test`, `make lint`, `make RELEASE=1`.
CI and PKGBUILD check type safety and the paging, preview cancellation and shader compatibility regressions.
Package source points to `big-comm/gnome-shell-extension-big-clipboard`, branch `main`; publish the migrated source there before a remote package build.
