import Adw from 'gi://Adw';
// DEBUG-ONLY
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { loadConfig } from './lib/common/actions.js';
import { Icon } from './lib/common/icons.js';
import { CopyousSettings, migrateSettings } from './lib/common/settings.js';
import { ActionsPage } from './lib/preferences/actions/actionsPage.js';
import { DialogCustomization } from './lib/preferences/customization/dialogCustomization.js';
import { HeaderCustomization } from './lib/preferences/customization/headerCustomization.js';
import { ItemCustomization } from './lib/preferences/customization/itemCustomization.js';
import { ItemsCustomization } from './lib/preferences/customization/itemsCustomization.js';
import { Profiles } from './lib/preferences/customization/profiles.js';
import { ThemeCustomization } from './lib/preferences/customization/themeCustomization.js';
import { DependenciesWarningButton } from './lib/preferences/dependencies/dependencies.js';
import { DependenciesSettings } from './lib/preferences/dependencies/dependenciesSettings.js';
import { AppExclusionSettings } from './lib/preferences/general/appExclusionSettings.js';
import { BehaviorSettings } from './lib/preferences/general/behaviorSettings.js';
import { FeedbackSettings } from './lib/preferences/general/feedbackSettings.js';
import { HistorySettings } from './lib/preferences/general/historySettings.js';
import { LocationsGroup } from './lib/preferences/general/locationsGroup.js';
import { DialogShortcuts } from './lib/preferences/shortcuts/dialogShortcuts.js';
import { ItemActivationShortcuts, ItemShortcuts } from './lib/preferences/shortcuts/itemShortcuts.js';
import { NavigationShortcuts } from './lib/preferences/shortcuts/navigationShortcuts.js';
import { PopupMenuShortcuts } from './lib/preferences/shortcuts/popupMenuShortcuts.js';
import {
	SearchNavigationShortcuts,
	SearchScrollShortcuts,
	SearchShortcuts,
} from './lib/preferences/shortcuts/searchShortcuts.js';
import { SidebarPreferences } from './lib/preferences/sidebarPreferences.js';

export default class Preferences extends ExtensionPreferences {
	override async fillPreferencesWindow(window: Adw.PreferencesWindow) {
		window.default_width = 830;
		window.default_height = 610;
		window.search_enabled = false;

		migrateSettings(this.getSettings());

		const navigation = new SidebarPreferences(window, this.metadata.name);
		const dependenciesButton = new DependenciesWarningButton(this, window);
		navigation.header.pack_end(dependenciesButton);

		const history = new Adw.PreferencesPage({
			name: 'history',
			title: _('History'),
			icon_name: Icon.Clipboard,
		});
		const behavior = new Adw.PreferencesPage({
			name: 'behavior',
			title: _('Behavior'),
			icon_name: Icon.Settings,
		});
		const advanced = new Adw.PreferencesPage({
			name: 'advanced',
			title: _('Advanced'),
			icon_name: 'preferences-other-symbolic',
		});
		const storage = new Adw.PreferencesGroup({ title: _('Storage') });
		advanced.add(storage);
		history.add(new HistorySettings(this, window, storage));
		navigation.add(history);

		const indicator = new Adw.PreferencesGroup({ title: _('Panel Indicator') });
		const feedback = new FeedbackSettings(this, window, indicator);
		dependenciesButton.bind_property('gsound', feedback, 'gsound', GObject.BindingFlags.SYNC_CREATE);
		behavior.add(new BehaviorSettings(this));
		behavior.add(feedback);
		behavior.add(new AppExclusionSettings(this, window));
		const dependenciesSettings = new DependenciesSettings(this, window);
		dependenciesButton.bind_property('hljs', dependenciesSettings, 'hljs', GObject.BindingFlags.SYNC_CREATE);
		advanced.add(dependenciesSettings);
		advanced.add(new LocationsGroup(this, window));

		// Customization page
		const customization = new Adw.PreferencesPage({
			name: 'appearance',
			title: _('Appearance'),
			icon_name: Icon.Image,
		});
		navigation.add(customization);
		navigation.add(behavior);
		customization.add(indicator);

		customization.add(new Profiles(this));
		customization.add(new DialogCustomization(this));
		customization.add(new ItemCustomization(this));
		customization.add(new HeaderCustomization(this));
		const items = new ItemsCustomization(this, window);
		dependenciesButton.bind_property('hljs', items, 'hljs', GObject.BindingFlags.SYNC_CREATE);
		customization.add(items);
		customization.add(new ThemeCustomization(this));

		// Shortcuts page
		const shortcuts = new Adw.PreferencesPage({
			name: 'shortcuts',
			title: _('Shortcuts'),
			icon_name: Icon.Keyboard,
		});
		navigation.add(shortcuts);

		shortcuts.add(new DialogShortcuts(this));
		shortcuts.add(new ItemShortcuts(this));
		shortcuts.add(new ItemActivationShortcuts(this));
		shortcuts.add(new PopupMenuShortcuts());
		shortcuts.add(new NavigationShortcuts());
		shortcuts.add(new SearchShortcuts());
		shortcuts.add(new SearchNavigationShortcuts());
		shortcuts.add(new SearchScrollShortcuts(this));

		// Actions page
		const config = await loadConfig(this);
		const actions = new ActionsPage(this, window, config);
		navigation.add(actions);
		navigation.add(advanced);
		navigation.present();

		// Register icons
		const display = Gdk.Display.get_default()!;
		const iconTheme = Gtk.IconTheme.get_for_display(display);
		iconTheme.add_search_path(`${this.dir.get_path()}/icons`);

		// Register resources
		const resource = Gio.resource_load(`${this.path}/resources.gresource`);
		Gio.resources_register(resource);

		// Register css
		const provider = new Gtk.CssProvider();
		provider.load_from_resource('/org/gnome/Shell/Extensions/copyous/style.css');
		Gtk.StyleContext.add_provider_for_display(display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

		// Unregister resources
		window.connect('destroy', () => {
			Gio.resources_unregister(resource);
			Gtk.StyleContext.remove_provider_for_display(display, provider);
		});

		return Promise.resolve();
	}

	/* DEBUG-ONLY */
	override getSettings(schema?: string): Gio.Settings & CopyousSettings {
		try {
			const environment = GLib.get_environ();
			const settings = GLib.environ_getenv(environment, 'DEBUG_COPYOUS_SCHEMA');
			if (settings) schema ??= this.metadata['settings-schema'] + '.debug';

			return super.getSettings(schema) as Gio.Settings & CopyousSettings;
		} catch {
			// Fallback for when debug schema does not exist
			return super.getSettings() as Gio.Settings & CopyousSettings;
		}
	}
}
