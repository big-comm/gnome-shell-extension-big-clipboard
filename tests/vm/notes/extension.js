import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ClipboardEntry } from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/database/database.js';
import { GdaDatabase } from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/database/gda.js';
import { JsonDatabase } from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/database/json.js';
import { ContentType } from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/misc/clipboard.js';
import { EditDialog } from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/ui/components/editDialog.js';
import { markdownPreview } from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/ui/components/markdown.js';
import {
	SubjectEditor,
	SubjectsDialog,
} from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/ui/components/subjectsDialog.js';
import {
	FileItem,
	fileIcon,
} from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/ui/items/fileItem.js';
import {
	FilesItem,
	commonDirectory,
} from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/ui/items/filesItem.js';
import {
	SearchChange,
	SearchQuery,
} from 'file:///usr/share/gnome-shell/extensions/big-clipboard@communitybig.org/lib/ui/searchEntry.js';

const xml = `<node><interface name="org.communitybig.NotesTest">
<method name="Run"><arg type="s" direction="out"/></method>
<method name="Demo"><arg type="s" direction="out"/></method>
<method name="Panel"><arg type="s" direction="out"/></method>
<method name="CopyFiles"><arg type="s" direction="out"/></method>
<method name="Show"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
<method name="Action"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
<method name="Inspect"><arg type="s" direction="out"/></method>
</interface></node>`;
const delay = () =>
	new Promise((resolve) =>
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
			resolve();
			return GLib.SOURCE_REMOVE;
		}),
	);
function check(ok, message) {
	if (!ok) throw new Error(message);
}
function actors(root) {
	return [root, ...root.get_children().flatMap(actors)];
}
export default class extends Extension {
	enable() {
		this.bus = Gio.DBusExportedObject.wrapJSObject(xml, this);
		this.bus.export(Gio.DBus.session, '/org/communitybig/NotesTest');
	}
	disable() {
		this.editor?.close();
		this.restore();
		this.bus.unexport();
	}
	get ext() {
		return Main.extensionManager.lookup('big-clipboard@communitybig.org')?.stateObj;
	}
	fixture(type = 'Text') {
		return new ClipboardEntry(
			2000000000,
			type,
			'Olá 🌍\nResearch notes\nSecond item',
			true,
			'teal',
			GLib.DateTime.new_now_utc(),
			type === 'Code' ? { language: null } : null,
			'',
			'Work, Research',
		);
	}
	restore() {
		const d = this.ext?.clipboardDialog;
		if (this.saved && d) {
			d.close();
			d.clearEntries();
			d.loadEntries(this.saved);
			if (this.queryBackup) {
				const search = d._header.searchEntry;
				Object.assign(search, this.queryBackup.fields);
				for (const [key, value] of Object.entries(this.queryBackup.settings))
					this.ext.settings.set_boolean(key, value);
				this.queryBackup = null;
			}
			this.saved = null;
		}
	}
	Demo() {
		this.editor?.close();
		this.restore();
		const d = this.ext.clipboardDialog;
		this.saved = [...d._entries.values()];
		const search = d._header.searchEntry;
		this.queryBackup = {
			fields: { text: search.text, pinned: search.pinned, tag: search.tag, type: search.type },
			settings: Object.fromEntries(
				['exclude-pinned', 'exclude-tagged'].map((k) => [k, this.ext.settings.get_boolean(k)]),
			),
		};
		for (const key of Object.keys(this.queryBackup.settings)) this.ext.settings.set_boolean(key, false);
		Object.assign(search, { text: '', pinned: false, tag: null, type: null });
		d.clearEntries();
		const data = [
			[
				'Text',
				'Release notes\n\n**Ready for review**\n- Test files and tags\n- Preserve history',
				'teal',
				'Work, Release',
			],
			['File', 'file:///tmp/bgc-ui-files/Project%20notes.pdf', null, 'Documents'],
			[
				'Files',
				'file:///tmp/bgc-ui-files/Project%20notes.pdf\nfile:///tmp/bgc-ui-files/R%C3%A9sum%C3%A9.txt\nfile:///tmp/bgc-ui-files/Archive.zip',
				'purple',
				'Work',
			],
			['Code', 'const greeting = "Hello, GNOME";', 'blue', 'Development'],
			['Image', 'file:///tmp/bgc-ui-files/Preview.png', null, 'Design'],
			['Link', 'https://communitybig.org/', null, 'Community'],
		];
		const entries = Array.from({ length: 144 }, (_, i) => {
			const [type, content, tag, subjects] = data[i % data.length];
			return new ClipboardEntry(
				2100000000 + i,
				type,
				content,
				i < 2,
				tag,
				GLib.DateTime.new_now_utc().add_seconds(-i),
				type === 'Code' ? { language: null } : null,
				'',
				subjects,
			);
		});
		d.loadEntries(entries);
		d.open();
		return JSON.stringify({ fixtures: entries.length });
	}
	Panel() {
		const d = this.ext.clipboardDialog;
		return JSON.stringify({
			rendered: d._renderedCount,
			type: d._header.searchEntry.type,
			actors: actors(d)
				.filter(
					(a) =>
						a.mapped &&
						(a.reactive ||
							['file-name', 'files-preview-item', 'clipboard-type-filters'].includes(a.style_class)),
				)
				.map((a) => ({
					label: a.label ?? a.text,
					name: a.accessible_name,
					style: a.style_class,
					pos: a.get_transformed_position(),
					size: a.get_transformed_size(),
					parent: a.get_parent()
						? {
								pos: a.get_parent().get_transformed_position(),
								size: a.get_parent().get_transformed_size(),
							}
						: null,
				})),
		});
	}
	async CopyFilesAsync(_args, invocation) {
		const entry = this.fixture('Files');
		entry.content = 'file:///tmp/bgc-ui-files/Project%20notes.pdf\nfile:///tmp/bgc-ui-files/R%C3%A9sum%C3%A9.txt';
		await this.ext.clipboardManager.copyEntry(entry);
		invocation.return_value(new GLib.Variant('(s)', ['copied']));
	}
	Show(type) {
		this.editor?.close();
		this.ext.clipboardDialog.close();
		this.entry = this.fixture(type);
		this.editor = type === 'Image' ? new SubjectsDialog(this.entry) : new EditDialog(this.ext, this.entry);
		this.editor.open();
		return this.Inspect();
	}
	Action(action) {
		if (action === 'close') {
			this.editor?.close();
			this.editor = null;
			this.restore();
			return '{}';
		}
		if (action === 'split') {
			this.editor._split = true;
			this.editor.showPreview(true);
		} else if (action === 'preview') this.editor.showPreview(true);
		else if (action === 'edit') this.editor.showPreview(false);
		else if (action === 'demo') {
			const t = this.editor._entry.clutter_text;
			t.text =
				'# Research notes\n\n**Important:** finish the release review.\n\n- Verify GNOME 50 and 51\n- Preserve clipboard history\n\n1. Build the package\n2. Test the update\n\nUse `git status` before committing.\n\n[BigCommunity](https://communitybig.org/)';
		} else if (action === 'save') this.editor.buttonLayout.get_last_child().emit('clicked', 1);
		return this.Inspect();
	}
	Inspect() {
		const e = this.editor;
		if (!e) return '{}';
		const focus = global.stage.get_key_focus();
		return JSON.stringify({
			content: this.entry.content,
			subjects: this.entry.subjects,
			preview: e._preview?.visible,
			text: e._entry?.clutter_text.text,
			selection: e._entry ? [e._entry.clutter_text.cursor_position, e._entry.clutter_text.selection_bound] : null,
			focusInEditor: !!(focus && e.contains(focus)),
			actors: actors(e.dialogLayout)
				.filter((a) => a.reactive || a === e._entry || a === e._preview)
				.map((a) => ({
					name: a.accessible_name,
					label: a.label,
					style: a.style_class,
					visible: a.visible,
					mapped: a.mapped,
					pos: a.get_transformed_position(),
					size: a.get_transformed_size(),
					parent: a.get_parent()
						? {
								pos: a.get_parent().get_transformed_position(),
								size: a.get_parent().get_transformed_size(),
							}
						: null,
				})),
		});
	}
	async RunAsync(_params, invocation) {
		const passed = [];
		let db;
		try {
			const Gda = (await import('gi://Gda')).default;
			const fake = {
				logger: {
					info() {},
					log() {},
					error(...args) {
						throw new Error(args.map(String).join(' '));
					},
				},
			};
			for (const backend of ['sqlite', 'json']) {
				const path = `/tmp/bgc-notes-${backend}-${GLib.get_monotonic_time()}`;
				const file = Gio.File.new_for_path(path + (backend === 'sqlite' ? '.db' : '.json'));
				const create = () =>
					backend === 'sqlite' ? new GdaDatabase(fake, Gda, file) : new JsonDatabase(fake, file);
				db = create();
				await db.init();
				const a = await db.insert('Text', 'Persistent 🌍 **note**', null);
				check(a, 'insert');
				a.subjects = 'Work, Research';
				a.tag = 'teal';
				a.pinned = true;
				for (const field of ['subjects', 'tag', 'pinned']) await db.updateProperty(a, field);
				const image = await db.insert('Image', 'file:///tmp/notes-test-image.png', { width: 32, height: 32 });
				image.subjects = 'Pictures';
				await db.updateProperty(image, 'subjects');
				await db.insert('Text', 'unprotected', null);
				await db.close();
				db = create();
				await db.init();
				let entries = await db.entries();
				check(entries.length === 3, `${backend} reload count`);
				const loaded = entries.find((e) => e.content === 'Persistent 🌍 **note**');
				check(
					loaded?.subjects === 'Work, Research' && loaded.pinned && loaded.tag === 'teal',
					`${backend} reload properties`,
				);
				const img = entries.find((e) => e.type === 'Image');
				check(img.metadata.width === 32 && img.subjects === 'Pictures', 'image metadata');
				await db.deleteOldest(0, 0, true);
				entries = await db.entries();
				check(entries.length === 2, `${backend} retention`);
				img.subjects = '';
				await db.updateProperty(img, 'subjects');
				await db.clear(1);
				entries = await db.entries();
				check(entries.length === 1, `${backend} remove label + clear`);
				await db.clear(0);
				check((await db.entries()).length === 0, `${backend} explicit clear`);
				await db.close();
				db = null;
				passed.push(`${backend}: persistence, metadata, retention, remove, clear`);
			}
			// Upgrade a v2 fixture prepared by the runner; compare every pre-existing field.
			db = new GdaDatabase(fake, Gda, Gio.File.new_for_path('/tmp/bgc-notes-v2.db'));
			await db.init();
			const upgraded = await db.entries();
			check(upgraded.length === 3, 'v2 upgrade count');
			check(
				upgraded.some(
					(e) =>
						e.content === 'Old 🌍 note' &&
						e.pinned &&
						e.tag === 'purple' &&
						e.title === 'Legacy' &&
						e.subjects === '',
				),
				'v2 preservation',
			);
			check(
				upgraded.some((e) => e.type === 'Image' && e.metadata.width === 32),
				'v2 image',
			);
			await db.close();
			db = null;
			passed.push('SQLite v2 migration: old fields preserved');
			const reset = new GdaDatabase(fake, Gda, Gio.File.new_for_path('/tmp/bgc-notes-v2.db'));
			await reset.init();
			reset._connection.execute_non_select_command('UPDATE clipboard_version SET version=2');
			await reset.close();
			db = new GdaDatabase(fake, Gda, Gio.File.new_for_path('/tmp/bgc-notes-v2.db'));
			await db.init();
			check((await db.entries()).length === 3, 'idempotent migration');
			await db.close();
			db = null;
			passed.push('Re-upgrade after old schema version: preserved');
			for (const raw of [
				'<span color="red">& dangerous</span>',
				'**bold** *italic* `code`',
				'[x](javascript:evil)',
				'```\n<b>\n```',
				'- one\n> quote',
			])
				Pango.parse_markup(markdownPreview(raw).markup, -1, '\0');
			passed.push('Preview: valid escaped Pango, no HTML execution');
			const q = (text) => new SearchQuery(SearchChange.Different, text, false, false, null, false, null);
			const image = this.fixture('Image');
			check(q('#research').matchesEntry(true, image), 'image subject query');
			check(q('Work').matchesEntry(true, image), 'normal subject query');
			check(!q('#missing').matchesEntry(true, image), 'subject mismatch');
			passed.push('Search: subjects, image, missing subject');
			this.Show('Text');
			await delay();
			const e = this.editor,
				t = e._entry.clutter_text;
			t.text = 'Olá 🌍';
			t.set_selection(4, 5);
			e.applyFormat('bold');
			check(t.text === 'Olá **🌍**', 'Unicode bold');
			e.applyFormat('bold');
			check(t.text === 'Olá 🌍', 'toggle bold');
			t.text = 'first\nsecond';
			t.set_selection(0, -1);
			e.applyFormat('bullet');
			check(t.text === '- first\n- second', 'list');
			e.showPreview(true);
			await delay();
			check(e._preview.visible && !e._entry.visible, 'preview view');
			e.showPreview(false);
			await delay();
			check(e._entry.visible && global.stage.get_key_focus() === t, 'edit focus');
			t.text = '**saved** 🌍';
			const subject = actors(e.contentLayout).find((a) => a instanceof SubjectEditor);
			subject.text = ' Work, work, Café, Research ';
			const buttons = e.buttonLayout.get_children();
			buttons[buttons.length - 1].emit('clicked', 1);
			await delay();
			check(this.entry.content === '**saved** 🌍' && this.entry.subjects === 'Work, Café, Research', 'save');
			const incognito = this.ext.settings.get_boolean('incognito');
			this.ext.settings.set_boolean('incognito', true);
			try {
				await this.ext.clipboardManager.copyEntry(this.entry);
				const copied = await new Promise((resolve) =>
					St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, text) => resolve(text)),
				);
				check(copied === '**saved** 🌍', 'copy Markdown source');
				await delay();
			} finally {
				this.ext.settings.set_boolean('incognito', incognito);
			}
			passed.push('Copy: Markdown source and Unicode retained');
			// File MIME round trips use the real Shell clipboard, isolated from history recording.
			this.ext.settings.set_boolean('incognito', true);
			try {
				const manager = this.ext.clipboardManager;
				for (const paths of [
					['file:///tmp/bgc-ui-files/Project%20notes.pdf'],
					['file:///tmp/bgc-ui-files/Project%20notes.pdf', 'file:///tmp/bgc-ui-files/R%C3%A9sum%C3%A9.txt'],
				]) {
					const original = this.fixture(paths.length === 1 ? 'File' : 'Files');
					original.content = paths.join('\n');
					await manager.copyEntry(original);
					await delay();
					const source = {
						read_async: async () =>
							Gio.MemoryInputStream.new_from_bytes(
								new GLib.Bytes(new TextEncoder().encode(`copy\n${paths.join('\n')}`)),
							),
					};
					const decoded = await manager.getContent(source, ['x-special/gnome-copied-files']);
					check(JSON.stringify(decoded.paths) === JSON.stringify(paths), 'file clipboard paths');
					check(decoded.operation === 'copy', 'file copy preserves originals');
					const converted = await manager.convertContent(decoded);
					check(converted[0] === original.type, 'file clipboard type');
				}
				const uriSource = {
					read_async: async () =>
						Gio.MemoryInputStream.new_from_bytes(
							new GLib.Bytes(
								new TextEncoder().encode('# files\r\nfile:///tmp/bgc-ui-files/Project%20notes.pdf\r\n'),
							),
						),
				};
				const parsed = await manager.getContent(uriSource, ['text/uri-list']);
				check(parsed.paths.length === 1 && parsed.paths[0].endsWith('.pdf'), 'URI list comments and CRLF');
				check(
					(await manager.convertContent({ type: ContentType.File, paths: [], operation: 'copy' })) === null,
					'empty file list',
				);
				check(commonDirectory([]) === null, 'empty common directory');
				check(
					commonDirectory([
						Gio.File.new_for_uri('file:///a.pdf'),
						Gio.File.new_for_uri('smb://server/a.pdf'),
					]) === null,
					'mixed locations',
				);
				const one = this.fixture('File');
				one.content = 'file:///tmp/bgc-ui-files/Project%20notes.pdf';
				const item = new FileItem(this.ext, one);
				check(item._fileName.text === 'Project notes.pdf', 'file name');
				check(fileIcon(Gio.File.new_for_uri(one.content)).to_string().includes('pdf'), 'PDF MIME icon');
				item.destroy();
				const many = this.fixture('Files');
				many.content = Array.from({ length: 500 }, (_, i) => `file:///tmp/document-${i}.pdf`).join('\n');
				const group = new FilesItem(this.ext, many);
				const rows = actors(group).filter((a) => a.style_class === 'files-preview-item');
				check(rows.length === 12, 'large file selection bounded to 12 rows');
				group.destroy();
			} finally {
				this.ext.settings.set_boolean('incognito', incognito);
			}
			passed.push('Files: PDF icons, clipboard MIME, Unicode paths, URI comments, 500-file bounded preview');

			this.Show('Text');
			await delay();
			this.editor._entry.clutter_text.text = 'cancel me';
			this.editor.buttonLayout.get_first_child().emit('clicked', 1);
			await delay();
			check(this.entry.content.startsWith('Olá'), 'cancel');
			this.Show('Code');
			await delay();
			check(this.editor._languageButton && !this.editor._toolbar, 'code unaffected');
			this.editor.close();
			this.Show('Image');
			await delay();
			const input = actors(this.editor.contentLayout).find((a) => a instanceof SubjectEditor);
			input.text = 'Images, Design';
			this.editor.buttonLayout.get_last_child().emit('clicked', 1);
			await delay();
			check(this.entry.subjects === 'Images, Design', 'image labels');
			passed.push('Dialogs: format, preview/edit focus, save/cancel, code, image subjects');
			// Full history search still finds labels outside the initial page.
			const d = this.ext.clipboardDialog;
			this.saved = [...d._entries.values()];
			const search = d._header.searchEntry;
			this.queryBackup = {
				fields: { text: search.text, pinned: search.pinned, tag: search.tag, type: search.type },
				settings: Object.fromEntries(
					['exclude-pinned', 'exclude-tagged'].map((k) => [k, this.ext.settings.get_boolean(k)]),
				),
			};
			for (const key of Object.keys(this.queryBackup.settings)) this.ext.settings.set_boolean(key, false);
			Object.assign(search, { text: '', pinned: false, tag: null, type: null });
			d.clearEntries();
			const fixtures = Array.from(
				{ length: 140 },
				(_, i) =>
					new ClipboardEntry(
						2000000000 + i,
						'Text',
						`Fixture ${i}`,
						false,
						null,
						GLib.DateTime.new_now_utc().add_seconds(-i),
						null,
						'',
						i === 139 ? 'Rare topic' : '',
					),
			);
			d.loadEntries(fixtures);
			d.open();
			for (let n = 0; n < 20 && d._renderedCount !== 12; n++) await delay();
			check(d._renderedCount === 12, `initial 12: got ${d._renderedCount}, query ${d._header.searchEntry.text}`);
			d._header.searchEntry.text = '#Rare';
			for (let n = 0; n < 20 && d._renderedCount !== 1; n++) await delay();
			check(d._renderedCount === 1, `search beyond first page: got ${d._renderedCount}`);
			this.restore();
			passed.push('140 items: first 12, subject beyond first page');
			invocation.return_value(new GLib.Variant('(s)', [JSON.stringify({ ok: true, passed })]));
		} catch (error) {
			this.editor?.close();
			this.restore();
			if (db) await db.close();
			invocation.return_value(
				new GLib.Variant('(s)', [
					JSON.stringify({ ok: false, passed, error: String(error), stack: error.stack }),
				]),
			);
		}
	}
}
