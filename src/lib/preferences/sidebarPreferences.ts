import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

type Section = { page: Adw.PreferencesPage; row: Gtk.ListBoxRow };

export class SidebarPreferences {
	readonly header = new Adw.HeaderBar();
	private readonly _stack = new Gtk.Stack();
	private readonly _list = new Gtk.ListBox({
		selection_mode: Gtk.SelectionMode.SINGLE,
		css_classes: ['navigation-sidebar'],
	});
	private readonly _search = new Gtk.SearchEntry({
		placeholder_text: _('Search'),
		margin_start: 12,
		margin_end: 12,
		margin_top: 6,
		margin_bottom: 12,
	});
	private readonly _split = new Adw.NavigationSplitView({
		min_sidebar_width: 220,
		max_sidebar_width: 220,
	});
	private readonly _title = new Adw.WindowTitle();
	private readonly _sections: Section[] = [];
	private readonly _results = new Adw.PreferencesPage();
	private readonly _resultGroup = new Adw.PreferencesGroup();
	private readonly _resultRows: Adw.ActionRow[] = [];
	private readonly _empty = new Adw.StatusPage({
		title: _('No Results Found'),
		icon_name: 'system-search-symbolic',
	});
	private _selected?: Section;
	private readonly _root: Adw.NavigationPage;

	constructor(
		private readonly _window: Adw.PreferencesWindow,
		title: string,
	) {
		const sidebar = new Adw.ToolbarView();
		sidebar.add_top_bar(new Adw.HeaderBar({ title_widget: new Adw.WindowTitle({ title }) }));
		const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
		box.append(this._search);
		box.append(
			new Gtk.ScrolledWindow({
				hscrollbar_policy: Gtk.PolicyType.NEVER,
				vexpand: true,
				child: this._list,
			}),
		);
		sidebar.content = box;
		this._split.sidebar = new Adw.NavigationPage({ title, child: sidebar });

		const content = new Adw.ToolbarView({ content: this._stack });
		this.header.title_widget = this._title;
		content.add_top_bar(this.header);
		this._split.content = new Adw.NavigationPage({ title, child: content });
		this._root = new Adw.NavigationPage({ title, child: this._split, can_pop: false });

		this._results.add(this._resultGroup);
		this._stack.add_named(this._results, 'search-results');
		this._stack.add_named(this._empty, 'search-empty');
		this._search.connect('search-changed', () => this._updateSearch());
		this._search.connect('activate', () => {
			if (this._search.text.trim()) this._split.show_content = true;
		});
		this._search.connect('stop-search', () => {
			this._search.text = '';
		});
		this._list.connect('row-selected', (_list, row: Gtk.ListBoxRow | null) => {
			const section = this._sections.find((item) => item.row === row);
			if (!section) return;
			this._selected = section;
			this._search.text = '';
			this._showSection(section);
		});

		this._list.connect('row-activated', (_list, row: Gtk.ListBoxRow) => {
			const section = this._sections.find((item) => item.row === row);
			if (section) this._showSection(section);
		});

		const breakpoint = new Adw.Breakpoint({
			condition: Adw.BreakpointCondition.parse('max-width: 760sp'),
		});
		const collapsed = new GObject.Value();
		collapsed.init(GObject.TYPE_BOOLEAN);
		collapsed.set_boolean(true);
		breakpoint.add_setter(this._split, 'collapsed', collapsed);
		_window.add_breakpoint(breakpoint);
		_window.set_size_request(360, 360);

		const shortcuts = new Gtk.ShortcutController({ scope: Gtk.ShortcutScope.MANAGED });
		shortcuts.add_shortcut(
			new Gtk.Shortcut({
				trigger: Gtk.ShortcutTrigger.parse_string('<Control>f'),
				action: Gtk.CallbackAction.new(() => {
					this._split.show_content = false;
					this._search.grab_focus();
					return true;
				}),
			}),
		);
		this._root.add_controller(shortcuts);
	}

	add(page: Adw.PreferencesPage): void {
		const box = new Gtk.Box({ spacing: 12, margin_top: 6, margin_bottom: 6 });
		box.append(new Gtk.Image({ icon_name: page.icon_name }));
		box.append(new Gtk.Label({ label: page.title, xalign: 0 }));
		const row = new Gtk.ListBoxRow({ child: box });
		this._sections.push({ page, row });
		this._list.append(row);
		this._stack.add_named(page, page.name);
	}

	present(): void {
		// GNOME checks visible_page after loading extension preferences.
		this._window.add(new Adw.PreferencesPage({ title: this._root.title }));
		this._window.push_subpage(this._root);
		const first = this._sections[0];
		if (first) this._list.select_row(first.row);
	}

	private _showSection(section: Section): void {
		this._stack.visible_child = section.page;
		this._title.title = section.page.title;
		this._split.content.title = section.page.title;
		this._split.show_content = true;
	}

	private _updateSearch(): void {
		const query = this._search.text.trim().toLocaleLowerCase();
		for (const row of this._resultRows) this._resultGroup.remove(row);
		this._resultRows.length = 0;
		if (!query) {
			if (this._selected) this._showSection(this._selected);
			return;
		}

		for (const section of this._sections) {
			this._collectResults(section, section.page, query);
		}
		this._stack.visible_child = this._resultRows.length ? this._results : this._empty;
		this._title.title = _('Search');
		this._split.content.title = _('Search');
		// Keep the search field accessible on narrow windows.
		if (!this._split.collapsed) this._split.show_content = true;
	}

	private _collectResults(
		section: Section,
		widget: Gtk.Widget,
		query: string,
		group = '',
		expanders: Adw.ExpanderRow[] = [],
	): void {
		if (!widget.visible) return;
		if (widget instanceof Adw.PreferencesGroup) group = widget.title;
		if (widget instanceof Adw.PreferencesRow && widget.title) {
			const subtitle = widget instanceof Adw.ActionRow ? widget.subtitle : '';
			if (`${section.page.title} ${group} ${widget.title} ${subtitle}`.toLocaleLowerCase().includes(query)) {
				const target = widget;
				const result = new Adw.ActionRow({
					title: widget.title,
					use_markup: false,
					subtitle: [section.page.title, group].filter(Boolean).join(' › '),
					activatable: true,
				});
				result.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic' }));
				result.connect('activated', () => {
					this._search.text = '';
					this._list.select_row(section.row);
					this._showSection(section);
					for (const expander of expanders) expander.expanded = true;
					target.grab_focus();
				});
				this._resultGroup.add(result);
				this._resultRows.push(result);
			}
			if (!(widget instanceof Adw.ExpanderRow)) return;
			expanders = [...expanders, widget];
		}
		for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) {
			this._collectResults(section, child, query, group, expanders);
		}
	}
}
