import GIRepository from 'gi://GIRepository';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type CopyousExtension from '../../extension.js';
import { CustomColorScheme, ThemeSettings } from '../common/settings.js';
import { VERSION } from '../misc/compatibility.js';

const ACTIVE_STATE = (ExtensionState as unknown as { ACTIVE?: number }).ACTIVE ?? ExtensionState.ENABLED;
const FROSTED_UUID = 'frosted-glass@communitybig.org';
type RoundedBlur = Shell.BlurEffect & { corner_radius: number };
type Backend = { BlurEffect: new (props: { mode: number }) => RoundedBlur; BlurMode: { BACKGROUND: number } };
let backend: Promise<Backend | null> | null = null;

// Probe optional native code outside Shell before importing it.
async function loadBackend(): Promise<Backend | null> {
	let timeout = 0;
	try {
		const repository = GIRepository.Repository.dup_default();
		const launcher = new Gio.SubprocessLauncher({
			flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
		});
		for (const [name, paths] of [
			['GI_TYPELIB_PATH', repository.get_search_path()],
			['LD_LIBRARY_PATH', repository.get_library_path()],
		] as const) {
			launcher.setenv(name, [...paths, GLib.getenv(name)].filter(Boolean).join(':'), true);
		}
		launcher.setenv('LD_BIND_NOW', '1', true);
		const version = JSON.stringify(repository.get_version('Shell'));
		const process = launcher.spawnv([
			'gjs',
			'-c',
			`imports.gi.versions.Shell = ${version}; void imports.gi.Shell; void imports.gi.Blur.BlurEffect.$gtype;`,
		]);
		timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
			timeout = 0;
			process.force_exit();
			return GLib.SOURCE_REMOVE;
		});
		await new Promise<void>((resolve, reject) => {
			process.wait_check_async(null, (child, result) => {
				try {
					child!.wait_check_finish(result);
					resolve();
				} catch (error) {
					reject(error instanceof Error ? error : new Error(String(error)));
				}
			});
		});
		const uri = 'gi://Blur';
		const module = (await import(uri)) as { default: Backend };
		return module.default;
	} catch {
		return null;
	} finally {
		if (timeout) GLib.source_remove(timeout);
	}
}

export class PanelBlur {
	private readonly settings: ThemeSettings;
	private readonly frosted: Gio.Settings | null;
	private readonly disconnect: (() => void)[] = [];
	private native: Backend | null = null;
	private effect: RoundedBlur | null = null;
	private disposed = false;
	private backendRequested = false;

	constructor(
		private ext: CopyousExtension,
		private actor: St.Widget,
	) {
		this.settings = ext.settings.get_child('theme');
		const schema = Gio.SettingsSchemaSource.get_default()?.lookup('org.communitybig.frosted-glass', true);
		this.frosted = schema ? new Gio.Settings({ settings_schema: schema }) : null;
		if (VERSION < 51 || !this.frosted) return;
		const update = () => this.update();
		for (const [object, signal] of [
			[this.settings, 'changed::blur-background'],
			[this.frosted, 'changed'],
			[actor, 'notify::mapped'],
			[actor, 'style-changed'],
			[ext.themeManager!, 'notify::color-scheme'],
			[St.ThemeContext.get_for_stage(global.stage), 'notify::scale-factor'],
		] as const) {
			const id = (object as GObject.Object).connect(signal, update);
			this.disconnect.push(() => object.disconnect(id));
		}
		const id = Main.extensionManager.connect('extension-state-changed', () => {
			update();
			return undefined;
		});
		this.disconnect.push(() => Main.extensionManager.disconnect(id));
		this.update();
	}

	private update() {
		if (
			!this.disposed &&
			VERSION >= 51 &&
			this.frosted &&
			this.settings.get_boolean('blur-background') &&
			!this.backendRequested
		) {
			this.backendRequested = true;
			backend ??= loadBackend();
			void backend.then((native) => {
				if (this.disposed) return;
				this.native = native;
				this.update();
			});
		}

		const active =
			!this.disposed &&
			this.actor.mapped &&
			this.native &&
			this.settings.get_boolean('blur-background') &&
			this.frosted?.get_boolean('enabled') &&
			Main.extensionManager.lookup(FROSTED_UUID)?.state === (ACTIVE_STATE as ExtensionState) &&
			this.ext.themeManager?.colorScheme !== CustomColorScheme.HighContrast;
		if (!active) {
			if (this.effect) {
				this.actor.remove_effect(this.effect);
				this.effect = null;
				this.actor.remove_style_class_name('blur-background');
			}
			return;
		}
		if (!this.effect) {
			this.effect = new this.native!.BlurEffect({ mode: this.native!.BlurMode.BACKGROUND });
			this.actor.add_effect_with_name('big-clipboard-background', this.effect);
			this.actor.add_style_class_name('blur-background');
		}
		const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
		this.effect.radius = Math.round(this.frosted!.get_int('blur-strength') * 1.6 * scale);
		this.effect.brightness = this.ext.themeManager?.colorScheme === CustomColorScheme.Light ? 1 : 0.9;
		this.effect.corner_radius = this.actor.get_theme_node().get_border_radius(St.Corner.TOPLEFT);
	}

	destroy() {
		this.disposed = true;
		for (const disconnect of this.disconnect.splice(0)) disconnect();
		this.update();
	}
}
