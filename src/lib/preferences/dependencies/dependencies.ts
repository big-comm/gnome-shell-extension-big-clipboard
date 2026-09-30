import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../prefs.js';
import { getHljsPath } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';

export async function checkGda(prefs: ExtensionPreferences): Promise<boolean> {
	try {
		const Gda = (await import('gi://Gda')).default;

		// Check if SQLite provider is installed
		Gda.Config.get_provider('SQLite');

		return true;
	} catch (err) {
		prefs.getLogger().error((err as Error).message);
		return false;
	}
}

async function checkGSound(): Promise<boolean> {
	try {
		await import('gi://GSound');
		return true;
	} catch {
		return false;
	}
}

async function checkHighlightJS(prefs: ExtensionPreferences): Promise<boolean> {
	try {
		await import(getHljsPath(prefs).get_uri());
		return true;
	} catch (error) {
		return false;
	}
}

@registerClass()
class GuideDialog extends Adw.Dialog {
	constructor(
		title: string,
		subtitle: string,
		guideTitle: string,
		fedora: string,
		arch: string,
		ubuntu: string,
		opensuse: string,
	) {
		super();

		const toolbarView = new Adw.ToolbarView({
			extend_content_to_top_edge: true,
		});
		toolbarView.add_top_bar(new Adw.HeaderBar());
		this.set_child(toolbarView);

		const content = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
			margin_top: 36,
			margin_bottom: 24,
			margin_start: 24,
			margin_end: 24,
			spacing: 24,
		});

		toolbarView.content = new Gtk.ScrolledWindow({
			propagate_natural_height: true,
			propagate_natural_width: true,
			hscrollbar_policy: Gtk.PolicyType.NEVER,
			child: content,
		});

		// Title
		content.append(
			new Gtk.Label({
				label: title,
				css_classes: ['title-2'],
			}),
		);

		// Subtitle
		content.append(
			new Gtk.Label({
				label: subtitle,
				xalign: 0,
				max_width_chars: 0,
				wrap: true,
				css_classes: ['dim-label'],
			}),
		);

		// Install guide
		const installGuide = new Adw.PreferencesGroup({
			title: guideTitle,
		});
		content.append(installGuide);
		installGuide.add(
			new Adw.ActionRow({
				title: 'Fedora',
				subtitle: `sudo dnf install ${fedora}`,
				subtitle_selectable: true,
				css_classes: ['property'],
			}),
		);
		installGuide.add(
			new Adw.ActionRow({
				title: 'Arch Linux',
				subtitle: `sudo pacman -S ${arch}`,
				subtitle_selectable: true,
				css_classes: ['property'],
			}),
		);
		installGuide.add(
			new Adw.ActionRow({
				title: 'Ubuntu/Debian',
				subtitle: `sudo apt install ${ubuntu}`,
				subtitle_selectable: true,
				css_classes: ['property'],
			}),
		);
		installGuide.add(
			new Adw.ActionRow({
				title: 'OpenSUSE',
				subtitle: `sudo zypper install ${opensuse}`,
				subtitle_selectable: true,
				css_classes: ['property'],
			}),
		);
	}
}

@registerClass()
export class GdaDialog extends GuideDialog {
	constructor() {
		super(
			_('Libgda Not Installed'),
			_(
				'Libgda is required to store clipboard history between sessions. ' +
					'Install either libgda 5.0 or 6.0 with SQLite support to use this feature. ' +
					'After installing libgda you will need to log out or restart your system.',
			),
			_('Install Libgda'),
			'libgda libgda-sqlite',
			'libgda6',
			'gir1.2-gda-5.0',
			'libgda-6_0-sqlite typelib-1_0-Gda-6_0',
		);
	}
}

@registerClass({
	Properties: {
		libgda: GObject.ParamSpec.boolean('libgda', null, null, GObject.ParamFlags.READABLE, false),
		gsound: GObject.ParamSpec.boolean('gsound', null, null, GObject.ParamFlags.READABLE, false),
		hljs: GObject.ParamSpec.boolean('hljs', null, null, GObject.ParamFlags.READABLE, false),
	},
})
export class DependenciesWarningButton extends Gtk.MenuButton {
	private _libgda: boolean = false;
	private _gsound: boolean = false;
	private _hljs: boolean = false;

	private readonly _menu: Gio.Menu;
	private _items: string[] = ['libgda', 'gsound', 'hljs'];

	constructor(prefs: Preferences, window: Adw.PreferencesWindow) {
		super({
			icon_name: Icon.Warning,
			css_classes: ['flat'],
		});

		const gdaDialog = new GdaDialog();

		const gsoundDialog = new GuideDialog(
			_('GSound Not Installed'),
			_(
				'GSound is required to play sound effects. Install GSound to use this feature. ' +
					'After installing GSound you will need to log out or restart your system.',
			),
			_('Install GSound'),
			'gsound',
			'gsound',
			'gir1.2-gsound-1.0',
			'typelib-1_0-GSound-1_0',
		);

		const hljsDialog = new Adw.AlertDialog({
			heading: _('Syntax highlighting unavailable'),
			body: _('Reinstall the Big Clipboard package to restore the bundled code highlighting files.'),
		});
		hljsDialog.add_response('close', _('Close'));
		hljsDialog.set_close_response('close');

		// Menu
		const actionGroup = new Gio.SimpleActionGroup();

		const libgdaAction = Gio.SimpleAction.new('libgda', null);
		libgdaAction.connect('activate', () => gdaDialog.present(window));
		actionGroup.add_action(libgdaAction);

		const gsoundAction = Gio.SimpleAction.new('gsound', null);
		gsoundAction.connect('activate', () => gsoundDialog.present(window));
		actionGroup.add_action(gsoundAction);

		const hljsAction = Gio.SimpleAction.new('hljs', null);
		hljsAction.connect('activate', () => hljsDialog.present(window));
		actionGroup.add_action(hljsAction);

		this.insert_action_group('dependencies', actionGroup);

		this._menu = new Gio.Menu();
		this._menu.append(_('Libgda Not Installed'), 'dependencies.libgda');
		this._menu.append(_('GSound Not Installed'), 'dependencies.gsound');
		this._menu.append(_('Syntax highlighting unavailable'), 'dependencies.hljs');
		this.menu_model = this._menu;

		// Checks
		checkGda(prefs)
			.then((libgda) => {
				this._libgda = libgda;
				if (libgda) this.deleteItem('libgda');
				this.notify('libgda');
			})
			.catch(() => prefs.getLogger().warn('Libgda check failed'));

		checkGSound()
			.then((gsound) => {
				this._gsound = gsound;
				if (gsound) this.deleteItem('gsound');
				this.notify('gsound');
			})
			.catch(() => prefs.getLogger().warn('GSound check failed'));

		checkHighlightJS(prefs)
			.then((hljs) => {
				this._hljs = hljs;
				if (hljs) {
					this.deleteItem('hljs');
				}

				this.notify('hljs');
			})
			.catch(() => prefs.getLogger().warn('Highlight.js check failed'));
	}

	get libgda(): boolean {
		return this._libgda;
	}

	get gsound(): boolean {
		return this._gsound;
	}

	get hljs(): boolean {
		return this._hljs;
	}

	private deleteItem(item: string) {
		const index = this._items.indexOf(item);
		if (index < 0) return;

		this._items.splice(index, 1);
		this._menu.remove(index);
		if (this._items.length === 0) {
			this.visible = false;
		}
	}
}
