# Card preview fixture

Install system-wide Big Clipboard and this test extension in disposable GNOME 50/51 VMs. Restart the session, pause clipboard capture, then enable `clipboard-preview-test@local.test`.

Call `org.communitybig.PreviewTest.Run` at `/org/communitybig/PreviewTest` on the `org.gnome.Shell` session bus. Expect `ok: true`. Tests use in-memory entries and replace the clipboard with a synthetic note; no history entries are written.

Checks: Bash capture, Markdown Pango rendering, raw copying/editing, existing text fallback, preview updates after editing, bounded rendering, syntax colors and square 22px tag buttons. `Run` removes every test actor on completion. `Demo` explicitly leaves three synthetic cards visible; `Close` removes them. Disable and uninstall the fixture after testing. Restore settings and compare the original history against a backup.
