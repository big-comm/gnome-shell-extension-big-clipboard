import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import type { HLJSApi } from 'highlight.js';

import { getHljsLanguages, getHljsPath, getSelectedHljsLanguages } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';

@registerClass({
	Properties: {
		hljs: GObject.ParamSpec.boolean('hljs', null, null, GObject.ParamFlags.READWRITE, false),
	},
})
export class DependenciesSettings extends Adw.PreferencesGroup {
	declare hljs: boolean;

	constructor(prefs: ExtensionPreferences, window: Adw.PreferencesWindow) {
		super({ title: _('Syntax highlighting') });
		const row = new Adw.ActionRow({
			title: _('Code languages'),
			subtitle: _('Included with Big Clipboard. No download required.'),
			activatable: true,
		});
		this.bind_property('hljs', row, 'sensitive', GObject.BindingFlags.DEFAULT);
		row.add_suffix(new Gtk.Image({ icon_name: Icon.Next }));
		this.add(row);
		row.connect('activated', () => {
			const page = new LanguagePage(prefs);
			window.push_subpage(page);
		});
	}
}

@registerClass()
class LanguagePage extends Adw.NavigationPage {
	private _disposed = false;

	constructor(prefs: ExtensionPreferences) {
		super({ title: _('Code languages') });
		const view = new Adw.ToolbarView();
		view.add_top_bar(new Adw.HeaderBar());
		this.child = view;
		const page = new Adw.PreferencesPage();
		view.content = page;
		const group = new Adw.PreferencesGroup({
			description: _(
				'Common languages are always available. Enable additional languages for code detection and highlighting.',
			),
		});
		page.add(group);
		const search = new Gtk.SearchEntry({ placeholder_text: _('Search') });
		group.set_header_suffix(search);
		this.connect('destroy', () => {
			this._disposed = true;
		});
		this.populate(prefs, group, search).catch((error) => prefs.getLogger().error(error));
	}

	private async populate(prefs: ExtensionPreferences, group: Adw.PreferencesGroup, search: Gtk.SearchEntry) {
		const module = (await import(getHljsPath(prefs).get_uri())) as { default: HLJSApi };
		if (this._disposed) return;
		const common = new Set(module.default.listLanguages());
		const settings = prefs.getSettings();
		const initiallySelected = new Set(getSelectedHljsLanguages(prefs));
		for (const [id, name] of getHljsLanguages(prefs).sort((a, b) => a[1].localeCompare(b[1]))) {
			const builtin = common.has(id);
			const row = new Adw.SwitchRow({
				title: name,
				subtitle: builtin ? _('Always available') : id,
				active: builtin || initiallySelected.has(id),
				sensitive: !builtin,
			});
			row.connect('notify::active', () => {
				if (builtin) return;
				const selected = new Set(getSelectedHljsLanguages(prefs));
				if (row.active) selected.add(id);
				else selected.delete(id);
				settings.set_strv('highlight-languages', [...selected].sort());
			});
			search.connect('search-changed', () => {
				const text = search.text.toLocaleLowerCase();
				row.visible = name.toLocaleLowerCase().includes(text) || id.includes(text);
			});
			group.add(row);
		}
	}
}
