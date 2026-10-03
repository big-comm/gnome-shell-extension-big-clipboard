# Editor Enter VM test

Install this directory as `~/.local/share/gnome-shell/extensions/clipboard-enter-test@local.test/` in a disposable GNOME 50/51 session with Big Clipboard enabled. Log in again and enable the test extension.

Run without other GUI automation:

```sh
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/communitybig/EnterTest \
  --method org.communitybig.EnterTest.Run
```

Expect `ok: true`. Sends real keyboard input to text and code editors: Return, keypad Enter, Shift+Enter and replacement of a Unicode selection. Verifies Save preserves the newlines using an in-memory entry, without changing clipboard history. Disable the test extension afterward. Excluded from release archives.
