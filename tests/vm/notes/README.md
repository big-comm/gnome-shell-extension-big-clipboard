# Notes integration fixture

Run only in disposable GNOME 50/51 VMs. Install Big Clipboard system-wide, then install this folder as `~/.local/share/gnome-shell/extensions/clipboard-notes-test@local.test` and restart the session. Enable the test extension.

`Run` uses temporary SQLite/JSON databases under `/tmp`, temporary in-memory cards, and synthetic dialogs. It changes the clipboard to a sample note while history recording is paused. It restores the real dialog entries after its paging test. Do not interact with the popup while the test is running.

Prepare `/tmp/bgc-notes-v2.db` from a v2 database with three fixtures: a pinned purple text entry (`Old 🌍 note`, title `Legacy`), an image with width/height metadata of 32, and a code entry. The test migrates this temporary file only.

```sh
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/communitybig/NotesTest \
  --method org.communitybig.NotesTest.Run
```

Expect `ok: true`. Coverage: SQLite/JSON persistence, retention, label removal, explicit clearing, v2 migration, repeated migration, Unicode formatting, safe Pango preview, subject search including images and unloaded cards, saving/canceling, code editing, Markdown copying and first-page limits with 140 entries.

`Show Text`, `Show Code` and `Show Image` open disposable editor fixtures. `Action demo`, `Action preview`, `Action edit` and `Action close` support visual checks. `Inspect` exposes only the synthetic dialog's contents and actor geometry.

After testing, call `Action close`, disable and uninstall the fixture. Check the journal and compare original database rows/image hashes with the backup taken before installing the build. This fixture is not packaged.
