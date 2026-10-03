import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/misc/clipboard.ts', 'utf8');
const fragment = source.slice(source.indexOf('export class ClipboardManager')).replace('export class', 'class');
let incognito = false,
	change,
	reads = 0;
const settings = {
	get_boolean: () => incognito,
	get_strv: () => [],
	connectObject: (_s, fn) => {
		change = fn;
	},
	disconnectObject: () => {},
};
const rows = [];
const errors = [];
const C = vm.runInNewContext(
	ts.transpileModule(fragment, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText +
		';ClipboardManager',
	{
		GObject: {
			Object: class {
				emit() {}
			},
		},
		global: { display: { get_selection: () => ({ connect: () => 1, disconnect() {} }), focus_window: null } },
		St: { Clipboard: { get_default: () => ({}) } },
		Keyboard: class {
			destroy() {}
		},
		Meta: { SelectionType: { SELECTION_CLIPBOARD: 0 } },
		MimeTypes: { Sensitive: ['private'] },
		ContentType: { Text: 0, File: 2 },
		contentChecksum: (c) => c.text,
		GLib: {},
	},
);
const manager = new C(
	{ settings, logger: { error: (e) => errors.push(e) } },
	{
		insert: async (...args) => {
			rows.push(args);
			return {};
		},
	},
);
manager.getContent = async (source) => {
	reads++;
	return { type: 0, text: source.text };
};
manager.convertContent = async (content) => [0, content.text, {}];
const copy = (text, mime = 'text/plain') => manager.ownerChanged(null, 0, { text, get_mimetypes: () => [mime] });
const toggle = (value) => {
	incognito = value;
	change();
};
toggle(true);
await copy('private text');
assert.equal(reads, 0, 'incognito must not read clipboard payloads');
toggle(false);
assert.equal(rows.length, 0, 'leaving incognito does not import the current clipboard');
await copy('private text');
assert.equal(rows.length, 1, 'explicitly copying the same text after incognito must work');
await copy('private text');
assert.equal(rows.length, 1, 'ordinary duplicate still suppressed');
await copy('sensitive text', 'private');
assert.equal(rows.length, 1, 'sensitive clipboard remains excluded');
let release;
manager.getContent = () =>
	new Promise((r) => {
		release = r;
	});
const pending = copy('slow copy');
toggle(true);
toggle(false);
release({ type: 0, text: 'slow copy' });
await pending;
assert.equal(rows.length, 1, 'mode changes cancel pending reads');
manager.getContent = async () => ({ type: 0, text: 'slow conversion' });
manager.convertContent = () =>
	new Promise((r) => {
		release = r;
	});
const converting = copy('slow conversion');
await Promise.resolve();
toggle(true);
toggle(false);
release([0, 'slow conversion', {}]);
await converting;
assert.equal(rows.length, 1, 'mode changes cancel pending conversions');
assert.equal(errors.length, 0);
manager.destroy();
console.log('Clipboard privacy: explicit recopy, duplicates, sensitive data and in-flight mode changes passed');
