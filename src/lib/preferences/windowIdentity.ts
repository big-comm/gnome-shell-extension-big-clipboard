import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

const APP_ID = 'org.communitybig.BigClipboard.Preferences';

/** Give only this preferences window its own desktop identity. */
export async function configureWindowIdentity(window: Adw.PreferencesWindow, path: string, uuid: string) {
	const display = Gdk.Display.get_default();
	if (!display) return;
	Gtk.IconTheme.get_for_display(display).add_search_path(`${path}/icons`);
	window.set_icon_name('big-clipboard');

	// Wayland taskbars resolve icons through the surface app ID and desktop entry.
	if (!isWaylandDisplay(display)) return;
	const { default: GdkWayland } = await import('gi://GdkWayland?version=4.0');
	const desktop = new GLib.KeyFile();
	const group = 'Desktop Entry';
	desktop.set_string(group, 'Type', 'Application');
	desktop.set_string(group, 'Name', 'Big Clipboard');
	desktop.set_string(group, 'Exec', `gnome-extensions prefs ${uuid}`);
	desktop.set_string(group, 'Icon', `${path}/icons/big-clipboard.png`);
	desktop.set_boolean(group, 'NoDisplay', true);
	const directory = GLib.build_filenamev([GLib.get_user_data_dir(), 'applications']);
	GLib.mkdir_with_parents(directory, 0o755);
	const file = Gio.File.new_for_path(GLib.build_filenamev([directory, `${APP_ID}.desktop`]));
	const [data] = desktop.to_data();
	let current = '';
	try {
		const [, bytes] = file.load_contents(null);
		current = new TextDecoder().decode(bytes);
	} catch (error) {
		if (!(error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))) throw error;
	}
	if (current !== data) file.replace_contents(data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
	const identify = () => {
		const surface = window.get_surface();
		if (surface) GdkWayland.WaylandToplevel.prototype.set_application_id.call(surface, APP_ID);
	};
	window.connect('map', identify);
	if (window.get_realized()) identify();
}

function isWaylandDisplay(display: Gdk.Display): boolean {
	return display.constructor.name.includes('Wayland');
}
