// Run on a GNOME session with GSETTINGS_BACKEND=memory, LANGUAGE=en and the
// GNOME Shell GI_TYPELIB_PATH/LD_LIBRARY_PATH used by gnome-extensions prefs.
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
const { PACKAGE_VERSION } = await import('resource:///org/gnome/Shell/Extensions/js/misc/config.js');
const { ExtensionPreferences } = await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js');
if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory')
	throw new Error('Set GSETTINGS_BACKEND=memory for isolated settings');
const path = ARGV[0];
if (!path) throw new Error('Pass the absolute path of the built extension under gnome-shell/extensions/<uuid>');
const { default: Preferences } = await import(`file://${path}/prefs.js`);
const metadata = JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${path}/metadata.json`)[1]));
const prefs = new Preferences({ ...metadata, path, dir: Gio.File.new_for_path(path) });
ExtensionPreferences.lookupByUUID = (uuid) => (uuid === metadata.uuid ? prefs : null);
const delay = (ms) =>
	new Promise((resolve) =>
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
			resolve();
			return GLib.SOURCE_REMOVE;
		}),
	);
function walk(widget) {
	const found = [widget];
	for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) found.push(...walk(child));
	return found;
}
function assert(value, message) {
	if (!value) throw new Error(message);
	print(`PASS ${message}`);
}

async function check(window, prefs) {
	await delay(400);
	const split = walk(window).find((w) => w instanceof Adw.NavigationSplitView);
	const list = walk(split.sidebar).find((w) => w instanceof Gtk.ListBox);
	const stack = walk(split.content).find((w) => w instanceof Gtk.Stack);
	const search = walk(split.sidebar).find((w) => w instanceof Gtk.SearchEntry);
	const title = walk(split.content).find((w) => w instanceof Adw.WindowTitle);
	const select = (index) => list.select_row(list.get_row_at_index(index));
	const row = (label) => walk(stack.visible_child).find((w) => w instanceof Adw.PreferencesRow && w.title === label);
	const settings = prefs.getSettings();
	const before = Object.fromEntries(
		settings.settings_schema.list_keys().map((k) => [k, settings.get_value(k).print(true)]),
	);
	assert(!!window.get_visible_page(), 'GNOME preferences loader accepts window');
	assert(split.parent instanceof Adw.NavigationPage && !split.parent.can_pop, 'sidebar root disables Back');
	const sections = ['history', 'appearance', 'behavior', 'shortcuts', 'actions', 'advanced'];
	for (const [index, name] of sections.entries()) {
		select(index);
		await delay(100);
		assert(stack.visible_child.name === name, `section ${name} opens`);
		assert(title.title === stack.visible_child.title, `section ${name} title follows selection`);
	}
	select(2);
	const pasteOnSelect = row('Paste Directly on Selection');
	const swapBefore = settings.get_boolean('swap-copy-shortcut');
	assert(pasteOnSelect instanceof Adw.SwitchRow, 'paste selection switch is in Behavior');
	assert(pasteOnSelect.active === !swapBefore, 'paste selection preserves existing preference');
	for (const active of [false, true]) {
		pasteOnSelect.active = active;
		assert(settings.get_boolean('swap-copy-shortcut') === !active, 'paste selection writes inverted preference');
		select(3);
		assert(!row('Swap Copy Shortcut'), 'activation preference is not duplicated');
		assert(row('Paste Item').shortcuts[0] === (active ? 'Return space' : '<Shift>Return space'), 'paste shortcut tracks selection behavior');
		assert(row('Copy Item').shortcuts[0] === (active ? '<Shift>Return space' : 'Return space'), 'copy shortcut tracks selection behavior');
		select(2);
	}
	settings.set_boolean('swap-copy-shortcut', swapBefore);
	assert(pasteOnSelect.active === !swapBefore, 'paste switch tracks external changes');
	select(1);
	const compact = row('Compact Filters');
	const compactBefore = settings.get_boolean('compact-type-filters');
	compact.active = !compactBefore;
	assert(settings.get_boolean('compact-type-filters') === !compactBefore, 'compact filters writes preference');
	settings.set_boolean('compact-type-filters', compactBefore);
	assert(compact.active === compactBefore, 'compact filters tracks external changes');
	select(0);
	assert(!row('Database'), 'database controls moved out of History');
	const size = row('History Size');
	const originalSize = size.value;
	size.value = originalSize + 1;
	assert(settings.get_int('history-length') === originalSize + 1, 'History Size writes existing setting');
	settings.set_int('history-length', originalSize);
	assert(size.value === originalSize, 'History Size receives external setting');
	const limit = row('Expiration');
	const originalLimit = limit.value;
	limit.value = 45;
	assert(settings.get_int('history-time') === 45, 'Expiration writes existing setting');
	limit.value = originalLimit;
	select(1);
	const blur = row('Blur Background');
	assert(!!blur, 'background blur control exists');
	assert(blur.sensitive === Number.parseInt(PACKAGE_VERSION) >= 51, 'background blur requires GNOME 51');
	const theme = settings.get_child('theme');
	blur.active = true;
	assert(theme.get_boolean('blur-background'), 'background blur binding');
	blur.active = false;
	const indicator = row('Indicator Display');
	assert(!!indicator, 'indicator controls moved to Appearance');
	const originalIndicator = indicator.selected;
	indicator.selected = 3;
	assert(settings.get_enum('indicator-display') === 3, 'indicator binding preserved');
	indicator.selected = originalIndicator;
	for (const [section, label] of [
		[2, 'Sound'],
		[4, 'Default Actions'],
		[5, 'Code languages'],
	]) {
		select(section);
		const target = row(label);
		assert(target?.sensitive, `${label} is available`);
		target.activate();
		await delay(350);
		assert(!split.get_mapped(), `${label} subpage opens`);
		assert(window.pop_subpage(), `${label} subpage supports Back`);
		await delay(350);
		assert(split.get_mapped() && stack.visible_child.name === sections[section], `${label} returns to its section`);
	}
	select(0);
	search.text = 'Text Cursor';
	await delay(300);
	assert(stack.visible_child_name === 'search-results', 'search reaches nested appearance option');
	const match = row('Show at Text Cursor');
	assert(!!match, 'nested option appears in search');
	match.activate();
	await delay(300);
	assert(stack.visible_child.name === 'appearance', 'search result opens original section');
	assert(row('Position').expanded, 'search expands containing row');
	search.text = 'zzzzzznoresult';
	await delay(300);
	assert(stack.visible_child_name === 'search-empty', 'empty search state');
	search.emit('stop-search');
	await delay(300);
	assert(stack.visible_child.name === 'appearance', 'Escape restores selected section');
	window.set_default_size(650, 700);
	await delay(600);
	assert(split.collapsed, 'narrow window collapses sidebar');
	split.show_content = false;
	await delay(300);
	list.emit('row-activated', list.get_selected_row());
	await delay(300);
	assert(split.show_content, 'current section can reopen on narrow window');
	split.show_content = false;
	search.text = 'History Size';
	await delay(300);
	assert(!split.show_content, 'narrow search keeps entry accessible');
	search.emit('activate');
	await delay(300);
	assert(split.show_content && stack.visible_child_name === 'search-results', 'Enter shows narrow search results');
	search.text = '';
	await delay(300);
	window.set_default_size(1080, 760);
	await delay(600);
	assert(!split.collapsed, 'wide window restores sidebar');
	for (const [key, value] of Object.entries(before))
		assert(settings.get_value(key).print(true) === value, `setting preserved: ${key}`);
	const style = Adw.StyleManager.get_default();
	style.color_scheme = GLib.getenv('SIDEBAR_TEST_LIGHT') ? Adw.ColorScheme.FORCE_LIGHT : Adw.ColorScheme.FORCE_DARK;
	select(0);
	print('SIDEBAR_CHECKS_PASSED');
}

const app = new Adw.Application({ application_id: 'org.communitybig.ClipboardPreferencesTestRunner' });
let window;
let failed = false;
app.connect('activate', async () => {
	window = new Adw.PreferencesWindow({ application: app, title: 'Big Clipboard' });
	await prefs.fillPreferencesWindow(window);
	if (!window.visible_page) throw new Error('GNOME loader requires a visible page');
	window.present();
	print('SIDEBAR_READY');
	try {
		await check(window, prefs);
	} catch (error) {
		logError(error);
		failed = true;
	} finally {
		window.close();
	}
});
await app.runAsync([]);

if (failed) throw new Error('Preferences navigation checks failed');
