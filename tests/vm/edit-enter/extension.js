import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const xml =
	'<node><interface name="org.communitybig.EnterTest"><method name="Run"><arg type="s" direction="out"/></method></interface></node>';
const pause = (ms) =>
	new Promise((r) =>
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
			r();
			return GLib.SOURCE_REMOVE;
		}),
	);
export default class extends Extension {
	enable() {
		this.bus = Gio.DBusExportedObject.wrapJSObject(xml, this);
		this.bus.export(Gio.DBus.session, '/org/communitybig/EnterTest');
	}
	disable() {
		this.editor?.close();
		this.bus?.unexport();
	}
	async RunAsync(_args, invocation) {
		const results = [];
		try {
			const ext = Main.extensionManager.lookup('big-clipboard@communitybig.org').stateObj;
			const { EditDialog } = await import(`file://${ext.path}/lib/ui/components/editDialog.js`);
			ext.clipboardDialog.close();
			await pause(200);
			const keys = global.stage.context
				.get_backend()
				.get_default_seat()
				.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
			for (const type of ['Text', 'Code']) {
				const fixture = { type, content: 'First', subjects: '', metadata: { language: null } };
				this.editor = new EditDialog(ext, fixture);
				this.editor.open();
				await pause(350);
				const text = this.editor._entry.clutter_text;
				for (const [name, input, start, end, key, shift, expected] of [
					['enter', 'First', -1, -1, Clutter.KEY_Return, false, 'First\n'],
					['keypad', 'First', -1, -1, Clutter.KEY_KP_Enter, false, 'First\n'],
					['shift-enter', 'First', -1, -1, Clutter.KEY_Return, true, 'First\n'],
					['unicode-selection', 'A🌍BC', 1, 3, Clutter.KEY_Return, false, 'A\nC'],
				]) {
					text.text = input;
					text.set_selection(start, end);
					text.grab_key_focus();
					await pause(80);
					if (shift)
						keys.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
					keys.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
					await pause(50);
					keys.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
					if (shift)
						keys.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
					await pause(120);
					results.push({
						type,
						name,
						text: text.text,
						expected,
						ok: text.text === expected,
						singleLine: text.single_line_mode,
						activatable: text.activatable,
					});
				}
				this.editor.buttonLayout.get_last_child().emit('clicked', 1);
				await pause(150);
				results.push({ type, name: 'save', ok: fixture.content === 'A\nC', content: fixture.content });
				this.editor = null;
			}
			invocation.return_value(
				new GLib.Variant('(s)', [JSON.stringify({ ok: results.every((r) => r.ok), results })]),
			);
		} catch (e) {
			invocation.return_value(
				new GLib.Variant('(s)', [JSON.stringify({ error: String(e), stack: e.stack, results })]),
			);
		} finally {
			this.editor?.close();
			this.editor = null;
		}
	}
}
