import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const xml =
	'<node><interface name="org.communitybig.SearchTest"><method name="Check"><arg type="s" direction="out"/></method></interface></node>';
const pause = (ms) =>
	new Promise((r) =>
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
			r();
			return GLib.SOURCE_REMOVE;
		}),
	);
const check = (v, m) => {
	if (!v) throw Error(m);
};
export default class extends Extension {
	enable() {
		this.bus = Gio.DBusExportedObject.wrapJSObject(xml, this);
		this.bus.export(Gio.DBus.session, '/org/communitybig/SearchTest');
	}
	disable() {
		this.bus?.unexport();
	}
	async CheckAsync(_args, invocation) {
		const ext = Main.extensionManager.lookup('big-clipboard@communitybig.org').stateObj;
		const d = ext.clipboardDialog,
			s = ext.settings,
			entry = d._header.searchEntry;
		const keys = [
			'compact-type-filters',
			'auto-hide-search',
			'remember-search',
			'clipboard-orientation',
			'clipboard-position-vertical',
		];
		const before = keys.map((k) => s.get_value(k));
		try {
			s.set_enum('clipboard-orientation', Clutter.Orientation.VERTICAL);
			s.set_boolean('compact-type-filters', true);
			s.set_boolean('auto-hide-search', true);
			s.set_boolean('remember-search', false);
			d.close();
			await pause(150);
			entry.text = '';
			entry.type = null;
			entry.pinned = false;
			d.open();
			await pause(600);
			const button = d._filters.get_children()[0];
			check(button.visible, 'magnifier missing');
			check(d._header.height === 0, 'compact search initially expanded');
			const seat = global.stage.context.get_backend().get_default_seat();
			const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
			const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
			// Start from a card, not an already focused search field.
			for (const hidden of [false, true]) {
				s.set_enum('clipboard-orientation', Clutter.Orientation.HORIZONTAL);
				s.set_boolean('auto-hide-search', hidden);
				d.close();
				await pause(200);
				entry.text = '';
				d.open();
				await pause(400);
				let expected = '';
				for (const c of 'abc') {
					keyboard.notify_keyval(GLib.get_monotonic_time(), c.charCodeAt(0), Clutter.KeyState.PRESSED);
					keyboard.notify_keyval(GLib.get_monotonic_time(), c.charCodeAt(0), Clutter.KeyState.RELEASED);
					expected += c;
					await pause(250);
					check(entry.text === expected, `first-key search (hidden=${hidden}): ${entry.text}`);
				}
			}
			entry.text = '';
			s.set_enum('clipboard-orientation', Clutter.Orientation.VERTICAL);
			s.set_boolean('auto-hide-search', true);
			d.close();
			await pause(200);
			d.open();
			await pause(400);
			const [x, y] = button.get_transformed_position();
			pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + button.width / 2, y + button.height / 2);
			await pause(80);
			pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
			await pause(80);
			pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
			await pause(350);
			check(entry.visible, 'click did not reveal entry');
			check(global.stage.key_focus === entry.clutter_text, 'entry not focused');
			for (const c of 'zznomatchxyz') {
				keyboard.notify_keyval(GLib.get_monotonic_time(), c.charCodeAt(0), Clutter.KeyState.PRESSED);
				keyboard.notify_keyval(GLib.get_monotonic_time(), c.charCodeAt(0), Clutter.KeyState.RELEASED);
			}
			await pause(700);
			check(entry.text === 'zznomatchxyz', 'keyboard text missing');
			check(d._renderedCount === 0, 'search did not filter history');
			entry.text = '';
			await pause(400);
			check(d._renderedCount > 0, 'clear did not restore history');
			s.set_boolean('remember-search', true);
			entry.text = 'remembered';
			d.close();
			await pause(150);
			d.open();
			await pause(400);
			check(entry.visible, 'remembered query hidden');
			entry.text = '';
			s.set_enum('clipboard-orientation', Clutter.Orientation.HORIZONTAL);
			s.set_boolean('compact-type-filters', false);
			s.set_boolean('auto-hide-search', false);
			await pause(200);
			check(entry.visible && !button.visible, 'normal mode regression');
			s.set_boolean('compact-type-filters', true);
			await pause(200);
			check(d._header.height > 0 && !button.visible, 'compact filters must keep search visible');
			const sizes = [];
			for (const position of [0, 2]) {
				s.set_enum('clipboard-position-vertical', position);
				await pause(250);
				const card = d._scrollView._scrollContainer.get_children().find((a) => a.entry);
				check(card, 'history card missing');
				sizes.push([card.width, card.height]);
				check(d._header.height > 0 && !button.visible, 'horizontal search must stay visible');
			}
			check(JSON.stringify(sizes[0]) === JSON.stringify(sizes[1]), 'top and bottom card sizes differ');

			s.set_boolean('compact-type-filters', true);
			s.set_enum('clipboard-orientation', Clutter.Orientation.VERTICAL);
			s.set_boolean('auto-hide-search', false);
			s.set_boolean('compact-type-filters', false);
			await pause(250);
			check(button.visible, 'vertical panel missing magnifier');
			button.emit('clicked', 1);
			await pause(250);
			check(entry.visible && d._header.height > 0, 'vertical panel prevents search');
			invocation.return_value(
				new GLib.Variant('(s)', [
					JSON.stringify({
						ok: true,
						checks: [
							'first key from card focus, visible and hidden search',
							'pointer click',
							'keyboard input',
							'filtered history',
							'clear',
							'remembered query',
							'normal mode',
							'vertical search',
							'top/bottom dimensions',
						],
					}),
				]),
			);
		} catch (e) {
			invocation.return_value(
				new GLib.Variant('(s)', [JSON.stringify({ ok: false, error: String(e), stack: e.stack })]),
			);
		} finally {
			entry.text = '';
			d.close();
			keys.forEach((k, i) => s.set_value(k, before[i]));
		}
	}
}
