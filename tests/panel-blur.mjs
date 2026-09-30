import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/ui/panelBlur.ts', 'utf8');
const code = ts.transpileModule(
	(
		source.slice(source.indexOf('const ACTIVE_STATE'), source.indexOf('const FROSTED_UUID')) +
		source.slice(source.indexOf('export class PanelBlur'))
	).replace('export class', 'class'),
	{ compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
class Signals {
	constructor(values = {}) {
		this.values = values;
		this.signals = new Map();
		this.next = 1;
	}
	connect(signal, cb) {
		const id = this.next++;
		this.signals.set(id, { signal, cb });
		return id;
	}
	disconnect(id) {
		assert.ok(this.signals.delete(id));
	}
	emit(signal) {
		for (const s of [...this.signals.values()]) if (s.signal === signal) s.cb();
	}
	get_boolean(k) {
		return this.values[k];
	}
	get_int(k) {
		return this.values[k];
	}
}
for (const version of [50, 51]) {
	const settings = new Signals({ 'blur-background': true });
	const frosted = new Signals({ 'enabled': true, 'blur-strength': 23 });
	const theme = new Signals();
	theme.colorScheme = 0;
	const context = new Signals();
	context.scale_factor = 1;
	const manager = new Signals();
	manager.state = 1;
	manager.lookup = () => ({ state: manager.state });
	const actor = new Signals();
	actor.mapped = true;
	actor.effects = [];
	actor.classes = new Set();
	actor.add_effect_with_name = (_n, e) => actor.effects.push(e);
	actor.remove_effect = (e) => {
		actor.effects.splice(actor.effects.indexOf(e), 1);
	};
	actor.add_style_class_name = (c) => actor.classes.add(c);
	actor.remove_style_class_name = (c) => actor.classes.delete(c);
	actor.get_theme_node = () => ({ get_border_radius: () => 24 });
	const Backend = { BlurEffect: class {}, BlurMode: { BACKGROUND: 1 } };
	const C = vm.runInNewContext(`let backend=Promise.resolve(Backend); ${code};PanelBlur`, {
		Backend,
		Gio: {
			SettingsSchemaSource: { get_default: () => ({ lookup: () => true }) },
			Settings: class {
				constructor() {
					return frosted;
				}
			},
		},
		VERSION: version,
		FROSTED_UUID: 'test',
		St: { ThemeContext: { get_for_stage: () => context }, Corner: { TOPLEFT: 0 } },
		global: { stage: {} },
		Main: { extensionManager: manager },
		ExtensionState: version === 51 ? { ACTIVE: 1 } : { ENABLED: 1 },
		CustomColorScheme: { HighContrast: 2, Light: 1 },
	});
	const ext = { settings: { get_child: () => settings }, themeManager: theme };
	const blur = new C(ext, actor);
	await Promise.resolve();
	assert.equal(actor.effects.length, version === 51 ? 1 : 0);
	if (version === 51) {
		assert.equal(actor.effects[0].radius, 37);
		assert.equal(actor.effects[0].corner_radius, 24);
		for (const [obj, signal, disable, enable] of [
			[actor, 'notify::mapped', () => (actor.mapped = false), () => (actor.mapped = true)],
			[
				settings,
				'changed::blur-background',
				() => (settings.values['blur-background'] = false),
				() => (settings.values['blur-background'] = true),
			],
			[frosted, 'changed', () => (frosted.values.enabled = false), () => (frosted.values.enabled = true)],
			[theme, 'notify::color-scheme', () => (theme.colorScheme = 2), () => (theme.colorScheme = 0)],
			[manager, 'extension-state-changed', () => (manager.state = 2), () => (manager.state = 1)],
		]) {
			disable();
			obj.emit(signal);
			assert.equal(actor.effects.length, 0);
			assert.equal(actor.classes.size, 0);
			enable();
			obj.emit(signal);
			assert.equal(actor.effects.length, 1);
		}
	}
	blur.destroy();
	assert.equal(actor.effects.length, 0);
	for (const obj of [settings, frosted, theme, context, manager, actor]) assert.equal(obj.signals.size, 0);
	const pending = new C(ext, actor);
	pending.destroy();
	await Promise.resolve();
	assert.equal(actor.effects.length, 0);
}
console.log(
	'Panel blur: GNOME 50 fallback, GNOME 51 gating, unmap, settings, contrast, extension state and cleanup passed',
);
