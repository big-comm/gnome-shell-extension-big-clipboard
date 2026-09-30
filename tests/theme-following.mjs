import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/misc/theme.ts', 'utf8');
const code = ts.transpileModule(
	source.slice(source.indexOf('export class ThemeManager')).replace('export class', 'class'),
	{
		compilerOptions: { target: ts.ScriptTarget.ES2022 },
	},
).outputText;

class Signals {
	callbacks = new Map();
	next = 0;
	connect(signal, callback) {
		const id = ++this.next;
		this.callbacks.set(id, { signal, callback });
		return id;
	}
	connectObject(signal, callback, owner) {
		const id = this.connect(signal, callback);
		this.callbacks.get(id).owner = owner;
	}
	disconnect(id) {
		this.callbacks.delete(id);
	}
	disconnectObject(owner) {
		for (const [id, connection] of this.callbacks) if (connection.owner === owner) this.disconnect(id);
	}
	emit(signal) {
		for (const connection of this.callbacks.values()) if (connection.signal === signal) connection.callback();
	}
	notify(signal) {
		this.emit(`notify::${signal}`);
	}
}

const settings = new Signals();
settings.values = { 'theme': 0, 'color-scheme': 0, 'custom-color-scheme': 0 };
settings.get_enum = (key) => settings.values[key];
settings.get_string = () => '';
const desktop = new Signals();
desktop.value = 'prefer-dark';
desktop.get_string = () => desktop.value;
const shell = new Signals();
shell.high_contrast = false;
shell.color_scheme = 1;
const loaded = new Set();
const styles = [];
const theme = {
	load_stylesheet(file) {
		loaded.add(file.uri);
		styles.push(file.uri);
	},
	unload_stylesheet(file) {
		assert.ok(loaded.delete(file.uri));
	},
};
const errors = [];
const resources = new Set();
const file = (uri) => ({
	uri,
	equal: (other) => uri === other.uri,
	load_contents_async: async () => [new TextEncoder().encode('')],
});
const customFile = { ...file('custom-theme.css'), replace_contents_async: async () => {} };
const Manager = vm.runInNewContext(`${code}; ThemeManager`, {
	GObject: { Object: Signals },
	Gio: {
		Settings: function () {
			return desktop;
		},
		resource_load: (path) => path,
		resources_register: (resource) => resources.add(resource),
		resources_unregister: (resource) => resources.delete(resource),
		File: { new_for_uri: file },
		FileCreateFlags: { REPLACE_DESTINATION: 1 },
	},
	St: { Settings: { get: () => shell }, ThemeContext: { get_for_stage: () => ({ get_theme: () => theme }) } },
	// Shell layouts may stay dark while desktop applications use light mode.
	Main: { getStyleVariant: () => 'dark' },
	global: { stage: {} },
	Theme: { Default: 0, Yaru: 1, Custom: 2 },
	ColorScheme: { System: 0 },
	CustomColorScheme: { Dark: 0, Light: 1, HighContrast: 2 },
	DefaultColors: {},
	getDataPath: () => ({ get_child: () => customFile }),
	TextDecoder,
	TextEncoder,
});
const manager = new Manager({
	path: '/extension',
	settings: { get_child: () => settings },
	logger: { error: (error) => errors.push(error) },
});
function expect(scheme) {
	assert.equal(manager.colorScheme, ['dark', 'light', 'high-contrast'].indexOf(scheme));
	assert.equal(loaded.size, 1);
	assert.ok(styles.at(-1).endsWith(`-${scheme}.css`));
}
function desktopScheme(value) {
	desktop.value = value;
	desktop.emit('changed::color-scheme');
}
function preference(key, value) {
	settings.values[key] = value;
	settings.emit('changed');
}
expect('dark');
for (const variant of [0, 1]) {
	preference('theme', variant);
	for (const value of ['default', 'prefer-dark', 'prefer-light', 'prefer-dark', 'default']) {
		desktopScheme(value);
		expect(value === 'prefer-dark' ? 'dark' : 'light');
	}
}
shell.high_contrast = true;
shell.notify('high-contrast');
expect('high-contrast');
desktopScheme('prefer-dark');
expect('high-contrast');
shell.high_contrast = false;
shell.notify('high-contrast');
expect('dark');
for (const [value, scheme] of [
	[1, 'dark'],
	[2, 'light'],
	[3, 'high-contrast'],
]) {
	preference('color-scheme', value);
	for (const desktopValue of ['default', 'prefer-dark']) {
		desktopScheme(desktopValue);
		expect(scheme);
	}
}
preference('theme', 2);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(manager.colorScheme, 0);
desktopScheme('default');
await new Promise((resolve) => setImmediate(resolve));
assert.equal(manager.colorScheme, 0);
preference('custom-color-scheme', 1);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(manager.colorScheme, 1);
manager.destroy();
assert.equal(loaded.size, 0);
assert.equal(resources.size, 0);
assert.equal(desktop.callbacks.size, 0);
assert.equal(shell.callbacks.size, 0);
assert.equal(settings.callbacks.size, 0);
const count = styles.length;
desktopScheme('prefer-dark');
assert.equal(styles.length, count);
assert.deepEqual(errors, []);
console.log('Theme following: desktop light/dark, fixed-dark Shell, overrides, high contrast and cleanup passed');
