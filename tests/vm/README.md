# Manual VM fixture

Use a disposable GNOME 50/51 session with Copyous enabled. This harness replaces the in-memory dialog contents, changes the clipboard and generates PNG files in `/tmp`; it does not seed the production database.

Install this directory as `~/.local/share/gnome-shell/extensions/copyous-audit@local.test/`, log in again, then enable `copyous-audit@local.test`.

```sh
call_audit() {
    gdbus call --session --dest org.gnome.Shell \
        --object-path /org/bigcommunity/CopyousAudit \
        --method "org.bigcommunity.CopyousAudit.$1" "${@:2}"
}
call_audit Prepare 1001000 # 1000 mixed text/image/code entries
call_audit Show
call_audit State          # Expect 12 cards after idle work completes
call_audit More           # Scroll to the next page
call_audit Search 00999   # Match beyond the initial page
call_audit Search ''
call_audit Hide
call_audit Prepare 10000  # Text stress fixture
```

Check `State` after each operation and after repeated reopenings. `Action` supports `copy-text`, `copy-image`, `pin`, `delete`, `horizontal`, `vertical`, `light`, `dark`.
For image verification, hide the popup and compare `wl-paste --type image/png | sha256sum` with the returned source path. Never retain a borrowed `GBytes` outside an `St.Clipboard` callback.

After testing, disable/uninstall the audit extension and disable/enable Copyous to restore the regular database view. Restore any changed orientation/theme settings.
The audit extension is excluded from release archives.
