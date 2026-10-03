# Compact search VM test

Use a disposable GNOME 50/51 session with Big Clipboard enabled and nonempty history. Install this directory as `~/.local/share/gnome-shell/extensions/clipboard-search-test@local.test/`, log in again, and enable it.

Run without other GUI automation:

```sh
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/communitybig/SearchTest \
  --method org.communitybig.SearchTest.Check
```

Expect `ok: true`. Tests the first character from card focus with visible/hidden search, pointer activation, keyboard input, empty search results, clearing, remembered queries, normal horizontal filters and vertical search. Restores changed settings and closes the dialog. Disable the test extension afterward. Excluded from release archives.
