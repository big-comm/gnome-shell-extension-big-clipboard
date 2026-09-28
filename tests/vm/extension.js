import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const xml = `<node><interface name="org.bigcommunity.CopyousAudit"><method name="Prepare"><arg type="u" direction="in"/><arg type="s" direction="out"/></method><method name="Show"><arg type="s" direction="out"/></method><method name="Hide"/><method name="State"><arg type="s" direction="out"/></method><method name="Search"><arg type="s" direction="in"/></method><method name="More"/><method name="End"/><method name="Action"><arg type="s" direction="in"/><arg type="s" direction="out"/></method></interface></node>`;
export default class Audit extends Extension {
	enable() {
		this.paintId = 0;
		this.paintMs = null;
		this.object = Gio.DBusExportedObject.wrapJSObject(xml, this);
		this.object.export(Gio.DBus.session, '/org/bigcommunity/CopyousAudit');
	}
	ext() {
		return Main.extensionManager.lookup('copyous@boerdereinar.dev')?.stateObj;
	}
	async PrepareAsync([count], invocation) {
		try {
			const ext = this.ext();
			if (!ext?.clipboardDialog) throw Error('Copyous not ready');
			const { ClipboardEntry } = await import(`file://${ext.path}/lib/database/database.js`);
			const mixed = count >= 1000000;
			if (mixed) count -= 1000000;
			this.mixed = mixed;
			if (mixed) {
				const pix = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 640, 480);
				pix.fill(0x3489baff);
				pix.savev('/tmp/copyous-audit-image.png', 'png', [], []);
			}
			const entries = [];
			const now = GLib.DateTime.new_now_utc();
			for (let i = 0; i < count; i++) {
				const type = mixed && i % 3 === 1 ? 'Image' : mixed && i % 3 === 2 ? 'Code' : 'Text';
				if (type === 'Image') {
					const pix = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 640, 480);
					pix.fill((((0x3489ba + i * 7919) << 8) | 255) >>> 0);
					pix.savev(`/tmp/copyous-audit-image-${i}.png`, 'png', [], []);
				}
				const content =
					type === 'Image'
						? `file:///tmp/copyous-audit-image-${i}.png`
						: type === 'Code'
							? `// Audit entry ${String(i).padStart(5, '0')}\nconst message = "clipboard test";\nconsole.log(message);`
							: `Audit entry ${String(i).padStart(5, '0')}\n` + 'sample '.repeat(i % 7 === 0 ? 1000 : 30);
				const metadata =
					type === 'Image'
						? { width: 640, height: 480 }
						: type === 'Code'
							? { language: { id: 'javascript', name: 'JavaScript' } }
							: null;
				entries.push(
					new ClipboardEntry(
						100000 + i,
						type,
						content,
						i % 10 === 0,
						null,
						now.add_seconds(-i),
						metadata,
						`Audit ${String(i).padStart(5, '0')}`,
					),
				);
			}

			this.Hide();
			const d = ext.clipboardDialog;
			d.clearEntries();
			this.t0 = GLib.get_monotonic_time();
			d.loadEntries(entries);
			this.loadMs = (GLib.get_monotonic_time() - this.t0) / 1000;
			this.count = count;
			invocation.return_value(new GLib.Variant('(s)', [this.State()]));
		} catch (e) {
			invocation.return_dbus_error(
				'org.bigcommunity.CopyousAudit.Error',
				String(e) + '\n' + String(e.stack ?? ''),
			);
		}
	}
	Show() {
		const d = this.ext().clipboardDialog;
		this.paintMs = null;
		const t = GLib.get_monotonic_time();
		if (this.paintId) global.stage.disconnect(this.paintId);
		this.paintId = global.stage.connect('after-paint', () => {
			this.paintMs = (GLib.get_monotonic_time() - t) / 1000;
			global.stage.disconnect(this.paintId);
			this.paintId = 0;
		});
		d.open();
		this.openMs = (GLib.get_monotonic_time() - t) / 1000;
		return this.State();
	}
	Hide() {
		this.ext()?.clipboardDialog?.close();
	}
	Search(text) {
		this.ext().clipboardDialog._header.searchEntry.text = text;
	}
	More() {
		const d = this.ext().clipboardDialog;
		const s = d._scrollView;
		const a = s.orientation === 0 ? s.hadjustment : s.vadjustment;
		a.value = Math.max(0, a.upper - a.page_size);
	}
	End() {
		const d = this.ext().clipboardDialog;
		if (d.requestMore) {
			d._loadToEnd = true;
			d.requestMore();
		}
	}
	async ActionAsync([action], invocation) {
		try {
			const ext = this.ext(),
				d = ext.clipboardDialog;
			const items = d._scrollView._scrollContainer.get_children().filter((a) => a.entry);
			let result = { action };
			if (action === 'pin') {
				items[1].entry.pinned = !items[1].entry.pinned;
				result.id = items[1].entry.id;
			} else if (action === 'delete') {
				const e = items[1].entry;
				result.id = e.id;
				e.emit('delete');
			} else if (action === 'copy-text' || action === 'copy-image') {
				const image = action === 'copy-image';
				const e = items.find((a) => a.entry.type === (image ? 'Image' : 'Text')).entry;
				await ext.clipboardManager.copyEntry(e);
				const c = St.Clipboard.get_default();
				if (image) {
					result.file = Gio.File.new_for_uri(e.content).get_path();
				} else {
					const text = await new Promise((r) =>
						c.get_text(St.ClipboardType.CLIPBOARD, (_c, text) => r(text)),
					);
					result.matches = text === e.content;
					result.length = text?.length;
				}
			} else if (action === 'horizontal' || action === 'vertical')
				ext.settings.set_enum('clipboard-orientation', action === 'horizontal' ? 0 : 1);
			else if (action === 'light' || action === 'dark') {
				const interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
				interfaceSettings.set_string('color-scheme', action === 'dark' ? 'prefer-dark' : 'default');
			}
			invocation.return_value(new GLib.Variant('(s)', [JSON.stringify(result)]));
		} catch (e) {
			invocation.return_dbus_error(
				'org.bigcommunity.CopyousAudit.Error',
				String(e) + '\n' + String(e.stack ?? ''),
			);
		}
	}
	State() {
		const ext = this.ext(),
			d = ext?.clipboardDialog,
			s = d?._scrollView,
			c = s?._scrollContainer;
		const items = c?.get_children().filter((a) => a.entry) ?? [];
		return JSON.stringify({
			version: ext?.metadata['version-name'],
			fixture: this.count,
			mixed: this.mixed,
			previewCount: items.filter((a) => a._imagePreview?._imageBox).length,
			types: items.reduce((r, a) => {
				r[a.entry.type] = (r[a.entry.type] ?? 0) + 1;
				return r;
			}, {}),
			loadMs: this.loadMs,
			openMs: this.openMs,
			paintMs: this.paintMs,
			opened: d?.opened,
			mapped: d?.mapped,
			items: items.length,
			visible: items.filter((a) => a.visible).length,
			first: items[0]?.entry.id,
			last: items.at(-1)?.entry.id,
			pending: d?._loadIdleId,
			rendered: d?._renderedCount,
			target: d?._pageTarget,
			index: d?._pendingIndex,
			refresh: d?._refreshIdleId,
			actors: global.stage.get_n_children(),
		});
	}
	disable() {
		if (this.paintId) global.stage.disconnect(this.paintId);
		this.paintId = 0;
		this.object?.unexport();
		this.object = null;
	}
}
