import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as IBusManager from 'resource:///org/gnome/shell/misc/ibusManager.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { EasingParamsWithProperties } from '@girs/gnome-shell/extensions/global';

import type CopyousExtension from '../../extension.js';
import { ItemType } from '../common/constants.js';
import { registerClass } from '../common/gjs.js';
import { Icon, loadIcon } from '../common/icons.js';
import { OpenClipboardDialogBehavior } from '../common/settings.js';
import { subjectNames } from '../common/subjects.js';
import { ClipboardEntry } from '../database/database.js';
import { entrySearchText } from '../database/searchText.js';
import { VERSION } from '../misc/compatibility.js';
import { ClipboardScrollView } from './clipboardScrollView.js';
import { ClipboardItemMenu } from './components/clipboardItemMenu.js';
import { TypeFilters } from './components/typeFilters.js';
import { ConfirmClearHistoryDialog } from './indicator.js';
import { CharacterItem } from './items/characterItem.js';
import type { ClipboardItem } from './items/clipboardItem.js';
import { CodeItem } from './items/codeItem.js';
import { ColorItem } from './items/colorItem.js';
import { FileItem } from './items/fileItem.js';
import { FilesItem } from './items/filesItem.js';
import { ImageItem } from './items/imageItem.js';
import { LinkItem } from './items/linkItem.js';
import { TextItem } from './items/textItem.js';
import { CenterBox, CollapsibleHeaderLayout, FitConstraint } from './layout.js';
import { PanelBlur } from './panelBlur.js';
import { SearchChange, SearchEntry, SearchQuery } from './searchEntry.js';

const ANIMATION_TIME = 100;
const INITIAL_LOAD_ITEMS = 12;
const LOAD_BATCH_ITEMS = 12;

@registerClass()
class IncognitoButton extends St.Button {
	private readonly _incognitoIcon: Gio.Icon;
	private readonly _incognitoDisabledIcon: Gio.Icon;
	private readonly _icon: St.Icon;

	constructor(
		private ext: CopyousExtension,
		props: Partial<St.Button.ConstructorProps>,
	) {
		super({ ...props, toggle_mode: true, can_focus: true });

		this._incognitoIcon = loadIcon(ext, Icon.Incognito);
		this._incognitoDisabledIcon = loadIcon(ext, Icon.IncognitoDisabled);

		this._icon = new St.Icon({ gicon: this._incognitoDisabledIcon });
		this.child = this._icon;

		this.ext.settings.connectObject('changed::incognito', this.update.bind(this), this);
		this.connect('notify::checked', () => {
			this.ext.settings.set_boolean('incognito', this.checked);
			this.update();
		});
		this.update();
	}

	override destroy() {
		this.ext.settings.disconnectObject(this);
		super.destroy();
	}

	private update() {
		const incognito = this.ext.settings.get_boolean('incognito');
		this.checked = incognito;
		this._icon.gicon = incognito ? this._incognitoIcon : this._incognitoDisabledIcon;
	}
}

@registerClass({
	Properties: {
		'header-visible': GObject.ParamSpec.boolean('header-visible', null, null, GObject.ParamFlags.READABLE, true),
	},
	Signals: {
		'open-settings': {},
		'clear-history': {},
	},
})
class ClipboardDialogHeader extends St.Widget {
	private readonly _headerLayout: CollapsibleHeaderLayout;
	private readonly _headerBox: CenterBox;
	private readonly _settingsButton: St.Button;
	private readonly _incognitoButton: St.Button;
	private readonly _clearButton: St.Button;

	public readonly searchEntry: SearchEntry;

	private _headerVisible: boolean = true;

	constructor(private ext: CopyousExtension) {
		super({
			style_class: 'dialog-header',
			clip_to_allocation: true,
			x_expand: true,
		});

		this._headerLayout = new CollapsibleHeaderLayout();
		this.layout_manager = this._headerLayout;

		this._headerBox = new CenterBox({ style_class: 'dialog-header-box', x_expand: true });
		this.add_child(this._headerBox);

		// Start
		this._settingsButton = new St.Button({
			style_class: 'dialog-header-icon-button',
			child: new St.Icon({ gicon: loadIcon(ext, Icon.Settings) }),
			can_focus: true,
		});
		this._settingsButton.connect('clicked', () => this.emit('open-settings'));
		this._headerBox.addPrefix(this._settingsButton);

		this._incognitoButton = new IncognitoButton(ext, { style_class: 'dialog-header-icon-button' });
		this._headerBox.addPrefix(this._incognitoButton);

		// Center
		this.searchEntry = new SearchEntry(ext);
		this.searchEntry.clutter_text.connect('key-focus-in', () => this.updateHeader(true));
		this._headerBox.centerWidget = this.searchEntry;

		// End
		this._clearButton = new St.Button({
			style_class: 'dialog-header-button',
			label: _('Clear'),
			can_focus: true,
		});
		this._clearButton.connect('clicked', () => this.emit('clear-history'));
		this._headerBox.addSuffix(this._clearButton);

		// Bind properties
		this.ext.settings.connectObject(
			'changed::auto-hide-search',
			() => this.updateHeader(!this.ext.settings.get_boolean('auto-hide-search'), false),
			this,
		);

		this.updateHeader(!this.ext.settings.get_boolean('auto-hide-search'), false);
	}

	override destroy() {
		this.ext.settings.disconnectObject(this);
		super.destroy();
	}

	get headerVisible() {
		return this._headerVisible;
	}

	set showButtons(show: boolean) {
		this._settingsButton.visible = show;
		this._incognitoButton.visible = show;
		this._clearButton.visible = show;
	}

	updateHeader(show: boolean, animate: boolean = true) {
		if (this.searchEntry.text.length > 0) show = true;

		this._headerLayout.enableCollapse = this.ext.settings.get_boolean('auto-hide-search');

		this._headerVisible = !this._headerVisible || show;
		this.notify('header-visible');

		const value = Number(show);
		if (animate) {
			this.ease_property('@layout.expansion', value, {
				mode: Clutter.AnimationMode.EASE_OUT_QUAD,
				duration: 200,
			});
		} else {
			this._headerLayout.expansion = value;
		}
	}

	override vfunc_navigate_focus(from: Clutter.Actor | null, direction: St.DirectionType): boolean {
		const res = super.vfunc_navigate_focus(from, direction);
		if (
			direction === St.DirectionType.UP ||
			direction === St.DirectionType.LEFT ||
			direction === St.DirectionType.RIGHT
		) {
			this.updateHeader(true);
		} else {
			this.updateHeader(res);
		}

		return res;
	}

	override vfunc_map() {
		super.vfunc_map();

		this.updateHeader(!this.ext.settings.get_boolean('auto-hide-search'), false);
	}
}

@registerClass({
	Signals: {
		'open-settings': {},
		'clear-history': {},
	},
})
class ClipboardDialogFooter extends St.BoxLayout {
	constructor(ext: CopyousExtension) {
		super({
			style_class: 'dialog-footer',
			y_align: Clutter.ActorAlign.END,
			x_expand: true,
			y_expand: true,
		});

		const settingsButton = new St.Button({
			style_class: 'dialog-footer-icon-button',
			child: new St.Icon({ gicon: loadIcon(ext, Icon.Settings) }),
			can_focus: true,
			x_align: Clutter.ActorAlign.START,
		});
		settingsButton.connect('clicked', () => this.emit('open-settings'));
		this.add_child(settingsButton);

		this.add_child(
			new IncognitoButton(ext, {
				style_class: 'dialog-footer-icon-button',
				x_align: Clutter.ActorAlign.START,
			}),
		);

		const clearButton = new St.Button({
			style_class: 'dialog-footer-button',
			label: _('Clear'),
			can_focus: true,
			x_align: Clutter.ActorAlign.END,
			x_expand: true,
		});
		clearButton.connect('clicked', () => this.emit('clear-history'));
		this.add_child(clearButton);
	}
}

@registerClass({
	Properties: {
		opened: GObject.ParamSpec.boolean('opened', null, null, GObject.ParamFlags.READABLE, false),
	},
	Signals: {
		'copy': { param_types: [GObject.TYPE_JSOBJECT] },
		'paste': { param_types: [GObject.TYPE_JSOBJECT] },
		'clear-history': { param_types: [GObject.TYPE_INT] },
	},
})
export class ClipboardDialog extends St.Widget {
	private _grab: Clutter.Grab | null = null;
	private _open: boolean = false;
	private _closing: boolean = false;
	private _updateCursor: boolean = true;
	private _nextCursor: [number, number] | null = null;
	private _cursor: [number, number] | null = null;
	private _loadIdleId: number = 0;
	private _entries = new Map<number, ClipboardEntry>();
	private _entrySignals = new Map<ClipboardEntry, number[]>();
	private _pendingEntries: ClipboardEntry[] = [];
	private _pendingIndex = 0;
	private _renderedCount = 0;
	private _pageTarget = INITIAL_LOAD_ITEMS;
	private _loadToEnd = false;
	private _refreshIdleId = 0;
	private _query: SearchQuery | null = null;
	private readonly _filters: TypeFilters;

	private _orientation: Clutter.Orientation = Clutter.Orientation.HORIZONTAL;
	private _layoutDirty: boolean = true;

	private readonly _ibusManager: IBusManager.IBusManager;

	private readonly _monitorConstraint: Layout.MonitorConstraint;
	private readonly _fitConstraint: FitConstraint;
	private readonly _widthConstraint: Clutter.BindConstraint;

	private readonly _dialog: St.BoxLayout;
	private readonly _panelBlur: PanelBlur;
	private readonly _header: ClipboardDialogHeader;
	private readonly _scrollView: ClipboardScrollView;
	private readonly _footer: ClipboardDialogFooter;
	private readonly _clipboardItemMenu: ClipboardItemMenu;

	constructor(private ext: CopyousExtension) {
		super({
			layout_manager: new Clutter.BinLayout(),
			x_align: Clutter.ActorAlign.FILL,
			y_align: Clutter.ActorAlign.FILL,
			x_expand: true,
			y_expand: true,
			visible: false,
			reactive: true,
		});

		this._monitorConstraint = new Layout.MonitorConstraint({ workArea: true });
		this.add_constraint(this._monitorConstraint);

		Main.layoutManager.modalDialogGroup.add_child(this);

		// Dialog
		this._dialog = new St.BoxLayout({
			orientation: Clutter.Orientation.VERTICAL,
			style_class: 'clipboard-dialog horizontal',
			x_align: Clutter.ActorAlign.FILL,
			y_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
			y_expand: true,
		});
		this.add_child(this._dialog);

		this._fitConstraint = new FitConstraint(this, false);
		this._dialog.add_constraint(this._fitConstraint);

		global.focus_manager.add_group(this._dialog);
		this._panelBlur = new PanelBlur(ext, this._dialog);

		// Header
		this._header = new ClipboardDialogHeader(ext);
		this._dialog.add_child(this._header);

		this._header.connect('open-settings', this.openSettings.bind(this));
		this._header.connect('clear-history', this.confirmClearHistory.bind(this));
		this._header.searchEntry.connect('search', (_, query: SearchQuery) => {
			if (query.change !== SearchChange.Same) this.searchEntries(query);
		});
		this._header.searchEntry.connect('activate', () => this._scrollView.activateFirst());

		this._header.connect('notify::header-visible', () => {
			if (this._header.headerVisible) {
				this._dialog.add_style_class_name('show-header');
			} else {
				this._dialog.remove_style_class_name('show-header');
			}
		});

		this._filters = new TypeFilters(ext, this._header.searchEntry);
		this._dialog.add_child(this._filters);

		// Scrollbox
		this._scrollView = new ClipboardScrollView(ext);
		this._dialog.add_child(this._scrollView);
		this._scrollView.connect('load-more', () => this.requestMore());
		this._scrollView.connect('load-end', () => {
			this._loadToEnd = true;
			this.requestMore();
		});

		this._widthConstraint = new Clutter.BindConstraint({
			coordinate: Clutter.BindCoordinate.WIDTH,
			source: this._scrollView,
			enabled: false,
		});
		this._header.add_constraint(this._widthConstraint);
		const filterWidth = new Clutter.BindConstraint({
			coordinate: Clutter.BindCoordinate.WIDTH,
			source: this._scrollView,
			enabled: false,
		});
		this._filters.add_constraint(filterWidth);
		this._widthConstraint.bind_property('enabled', filterWidth, 'enabled', GObject.BindingFlags.SYNC_CREATE);

		// Footer
		this._footer = new ClipboardDialogFooter(ext);
		this._dialog.add_child(this._footer);
		this._footer.connect('open-settings', this.openSettings.bind(this));
		this._footer.connect('clear-history', this.confirmClearHistory.bind(this));

		// Clipboard item menu
		this._clipboardItemMenu = new ClipboardItemMenu(ext);
		const clipboardItemMenuManager = new PopupMenu.PopupMenuManager(this);
		clipboardItemMenuManager.addMenu(this._clipboardItemMenu, 0);

		this._clipboardItemMenu.connectObject(
			'activate',
			() => this.close(),
			'copy',
			(_: unknown, s: string) => ext.clipboardManager?.copyText(s),
			'paste',
			(_: unknown, s: string) => ext.clipboardManager?.pasteText(s),
			this,
		);

		// Cursor position
		(Main.inputMethod as Clutter.InputMethod).connectObject(
			'cursor-location-changed',
			this.updateCursor.bind(this),
			this,
		);

		this._ibusManager = IBusManager.getIBusManager();
		this._ibusManager.connectObject(
			'focus-in',
			() => {
				// Update cursor after focus in since a focus out can trigger between cursor-location-changed and focus-in
				if (!this._updateCursor) return;
				this._cursor = this._nextCursor;
				this._nextCursor = null;
			},
			'focus-out',
			() => (this._cursor = null),
			this,
		);

		// Bind properties
		// prettier-ignore
		this.ext.settings.connectObject(
			'changed::show-at-pointer', this.markLayoutDirty.bind(this),
			'changed::clipboard-orientation', this.markLayoutDirty.bind(this),
			'changed::clipboard-position-horizontal', this.markLayoutDirty.bind(this),
			'changed::clipboard-position-vertical', this.markLayoutDirty.bind(this),
			'changed::clipboard-size', this.markLayoutDirty.bind(this),
			'changed::clipboard-margin-top', this.markLayoutDirty.bind(this),
			'changed::clipboard-margin-bottom', this.markLayoutDirty.bind(this),
			'changed::clipboard-margin-left', this.markLayoutDirty.bind(this),
			'changed::clipboard-margin-right', this.markLayoutDirty.bind(this),
			this);
	}

	private markLayoutDirty() {
		this._layoutDirty = true;
		// If currently visible, apply immediately so user-driven setting changes are reflected.
		if (this.opened) this.applyLayoutIfDirty();
	}

	private applyLayoutIfDirty() {
		if (!this._layoutDirty) return;
		this._layoutDirty = false;
		this.updatePosition();
		this.updateMargins();
	}

	override destroy() {
		this._panelBlur.destroy();
		this.clearEntries();
		(Main.inputMethod as Clutter.InputMethod).disconnectObject(this);
		this._ibusManager.disconnectObject(this);
		this.ext.settings.disconnectObject(this);
		this._clipboardItemMenu.disconnectObject(this);
		this._clipboardItemMenu.destroy();

		if (this._grab) {
			this._dialog.remove_all_transitions();
			this.finishClose();
		}

		this._scrollView.destroy();
		super.destroy();
	}

	get opened(): boolean {
		return this._open;
	}

	private set opened(value: boolean) {
		this._open = value;
		this.notify('opened');
	}

	public toggle() {
		if (!this.opened) this.open();
		else this.close();
	}

	public preWarm() {
		if (this.opened || !this.get_parent()) return;

		// Force one layout pass while still hidden so first open() is snappier.
		// Reading get_preferred_size triggers Clutter's allocation cycle, which
		// caches style nodes and child measurements.
		this.applyLayoutIfDirty();
		this._dialog.get_preferred_size();
		this._scrollView.preWarm();
	}

	public open() {
		if (this.opened) return;
		if (this._closing) {
			this._dialog.remove_all_transitions();
			this.finishClose();
		}

		// Lazy: layout settings are read on first open (and after any change)
		// instead of in the constructor, keeping the deferred enable cheap.
		this.applyLayoutIfDirty();

		this._updateCursor = false;
		this._nextCursor = this._cursor;

		const grab = Main.pushModal(this, { actionMode: Shell.ActionMode.SYSTEM_MODAL }) as Clutter.Grab;
		// GNOME 50 (Mutter 18) removed get_seat_state()/GrabState in favor of is_revoked()
		const grabFailed =
			VERSION >= 50
				? (grab as Clutter.Grab & { is_revoked(): boolean }).is_revoked()
				: (grab as Clutter.Grab & { get_seat_state(): number }).get_seat_state() !== Clutter.GrabState.ALL;
		if (grabFailed) {
			Main.popModal(grab);
			return;
		}

		this._grab = grab;
		this._monitorConstraint.index = global.display.get_current_monitor();
		Main.layoutManager.emit('system-modal-opened');

		// Authentication dialogs may have been added after this persistent actor.
		this.get_parent()?.set_child_above_sibling(this, null);
		this._dialog.opacity = 0;
		this.show();

		const horizontal = this._orientation === Clutter.Orientation.HORIZONTAL;
		if (horizontal && this._dialog.y_align === Clutter.ActorAlign.START) {
			this._dialog.translation_y = -6;
			this._dialog.set_pivot_point(0.5, 0);
		} else if (horizontal && this._dialog.y_align === Clutter.ActorAlign.END) {
			this._dialog.translation_y = 6;
			this._dialog.set_pivot_point(0.5, 1);
		} else if (!horizontal && this._dialog.x_align === Clutter.ActorAlign.START) {
			this._dialog.translation_x = -6;
			this._dialog.set_pivot_point(0, 0.5);
		} else if (!horizontal && this._dialog.x_align === Clutter.ActorAlign.END) {
			this._dialog.translation_x = 6;
			this._dialog.set_pivot_point(1, 0.5);
		} else {
			this._dialog.translation_y = -6;
			this._dialog.set_pivot_point(0.5, 0);
		}

		let mode = Clutter.AnimationMode.LINEAR;
		if (VERSION >= 49) {
			// Gnome 49 and above uses different animation
			mode = Clutter.AnimationMode.EASE_OUT_QUAD;
			this._dialog.scale_x = 0.96;
			this._dialog.scale_y = 0.96;
		}

		this.opened = true;
		global.compositor.disable_unredirect();

		this._dialog.ease({
			opacity: 255,
			translationX: 0,
			translationY: 0,
			scaleX: 1,
			scaleY: 1,
			duration: ANIMATION_TIME,
			mode,
		});
	}

	public close() {
		if (!this.opened) return;

		this.opened = false;
		this._closing = true;
		this._updateCursor = true;
		this._clipboardItemMenu.close();

		let mode = Clutter.AnimationMode.LINEAR;
		let easeArgs: Partial<EasingParamsWithProperties> = {};
		if (VERSION >= 49) {
			// Gnome 49 and above uses different animation
			mode = Clutter.AnimationMode.EASE_OUT_QUAD;
			easeArgs = {
				scaleX: 0.96,
				scaleY: 0.96,
			};

			const horizontal = this._orientation === Clutter.Orientation.HORIZONTAL;
			if (horizontal && this._dialog.y_align === Clutter.ActorAlign.START) {
				easeArgs.translationY = -6;
				this._dialog.set_pivot_point(0.5, 0);
			} else if (horizontal && this._dialog.y_align === Clutter.ActorAlign.END) {
				easeArgs.translationY = 6;
				this._dialog.set_pivot_point(0.5, 1);
			} else if (!horizontal && this._dialog.x_align === Clutter.ActorAlign.START) {
				easeArgs.translationX = -6;
				this._dialog.set_pivot_point(0, 0.5);
			} else if (!horizontal && this._dialog.x_align === Clutter.ActorAlign.END) {
				easeArgs.translationX = 6;
				this._dialog.set_pivot_point(1, 0.5);
			} else {
				easeArgs.translationY = -6;
				this._dialog.set_pivot_point(0.5, 0);
			}
		}

		this._dialog.ease({
			opacity: 0,
			...easeArgs,
			duration: ANIMATION_TIME,
			mode,
			onComplete: () => this.finishClose(),
		});
	}

	private finishClose() {
		if (this._grab) {
			Main.popModal(this._grab);
			this._grab = null;
		}

		this._closing = false;
		this.cancelPendingLoad();
		this._pageTarget = INITIAL_LOAD_ITEMS;
		// Unmapping may reset search and start a new first-page load.
		this.hide();
		global.compositor.enable_unredirect();
		// Keep only the first page ready for the next invocation.
		if (this._renderedCount > INITIAL_LOAD_ITEMS) this.searchEntries(this._header.searchEntry.searchQuery);
		else if (this._renderedCount < this._pageTarget && this._pendingIndex < this._pendingEntries.length)
			this.queueLoad();
	}

	public addEntry(entry: ClipboardEntry): void {
		this.trackEntry(entry);
		this.scheduleRefresh();
	}

	private trackEntry(entry: ClipboardEntry): void {
		if (this._entries.has(entry.id)) return;
		this._entries.set(entry.id, entry);
		const changed = entry.connect('notify', () => this.scheduleRefresh());
		const deleted = entry.connect('delete', () => {
			this._entries.delete(entry.id);
			for (const id of this._entrySignals.get(entry) ?? []) entry.disconnect(id);
			this._entrySignals.delete(entry);
			this.scheduleRefresh();
		});
		this._entrySignals.set(entry, [changed, deleted]);
	}

	private scheduleRefresh(): void {
		if (this._refreshIdleId) return;
		this._refreshIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
			this._refreshIdleId = 0;
			this.searchEntries(this._header.searchEntry.searchQuery);
			return GLib.SOURCE_REMOVE;
		});
	}

	public loadEntries(entries: ClipboardEntry[]): void {
		for (const entry of entries) this.trackEntry(entry);
		this.searchEntries(this._header.searchEntry.searchQuery);
	}

	public subjectSuggestions(): string[] {
		return subjectNames([...this._entries.values()].map((entry) => entry.subjects).join(','));
	}

	private searchEntries(query: SearchQuery): void {
		this._clipboardItemMenu?.close(BoxPointer.PopupAnimation.NONE);
		this.cancelPendingLoad();
		this._query = query.withChange(SearchChange.Different);
		this._pendingEntries = [...this._entries.values()].sort((a, b) => b.datetime.compare(a.datetime));
		this._filters?.updateCounts(this._pendingEntries);
		this._pendingIndex = 0;
		this._renderedCount = 0;
		this._pageTarget = INITIAL_LOAD_ITEMS;
		this._scrollView.clearItems();
		this._scrollView.search(this._query);
		this.loadBatch();
	}

	private loadBatch(): void {
		const batch: ClipboardItem[] = [];
		const deadline = GLib.get_monotonic_time() + 4000;
		while (
			this._pendingIndex < this._pendingEntries.length &&
			batch.length < Math.min(LOAD_BATCH_ITEMS, this._pageTarget - this._renderedCount)
		) {
			const entry = this._pendingEntries[this._pendingIndex++]!;
			if (this._query!.matchesEntry(true, entry, ...entrySearchText(entry))) {
				const item = this.createItem(entry, false);
				if (item) batch.push(item);
			}
			if (GLib.get_monotonic_time() >= deadline) break;
		}
		this._renderedCount += batch.length;
		this._scrollView.appendItems(batch);
		// Finish the first page; further pages require scrolling or End.
		if (
			this._pendingIndex < this._pendingEntries.length &&
			(this._renderedCount < this._pageTarget || this._loadToEnd)
		) {
			if (this._loadToEnd && this._renderedCount >= this._pageTarget) this._pageTarget += LOAD_BATCH_ITEMS;
			this.queueLoad();
		} else if (this._loadToEnd) {
			this._loadToEnd = false;
			this._scrollView.selectItem(this._renderedCount - 1);
		}
	}

	private requestMore(): void {
		if (
			!this.opened ||
			this._loadIdleId ||
			this._renderedCount < this._pageTarget ||
			this._pendingIndex >= this._pendingEntries.length
		)
			return;
		this._pageTarget = this._renderedCount + LOAD_BATCH_ITEMS;
		this.queueLoad();
	}

	private queueLoad(): void {
		if (this._loadIdleId) return;
		this._loadIdleId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
			this._loadIdleId = 0;
			this.loadBatch();
			return GLib.SOURCE_REMOVE;
		});
	}

	private cancelPendingLoad(): void {
		if (this._loadIdleId) GLib.source_remove(this._loadIdleId);
		this._loadIdleId = 0;
		this._loadToEnd = false;
	}

	private createItem(entry: ClipboardEntry, loadImagePreview: boolean = true): ClipboardItem | null {
		let item;
		try {
			item = (() => {
				switch (entry.type) {
					case ItemType.Text:
						return new TextItem(this.ext, entry);
					case ItemType.Code:
						return new CodeItem(this.ext, entry);
					case ItemType.Image:
						return new ImageItem(this.ext, entry, loadImagePreview);
					case ItemType.File:
						return new FileItem(this.ext, entry);
					case ItemType.Files:
						return new FilesItem(this.ext, entry);
					case ItemType.Link:
						return new LinkItem(this.ext, entry);
					case ItemType.Character:
						return new CharacterItem(this.ext, entry);
					case ItemType.Color:
						return new ColorItem(this.ext, entry);
					default:
						return null;
				}
			})();

			if (!item) {
				this.ext.logger.error('Unknown item type', entry);
				return null;
			}
		} catch (e) {
			this.ext.logger.error(e);
			return null;
		}

		// Connect edit
		item.connectObject('edit', () => this._clipboardItemMenu.edit(entry), this);

		// Share one popup between colors and additional actions.
		const openMenu = (colorsOnly: boolean, x: number, y: number, w: number, h: number) => {
			this._clipboardItemMenu.close(BoxPointer.PopupAnimation.NONE);
			const signalId = this._clipboardItemMenu.connect('open-state-changed', (_menu, state: boolean) => {
				item.sync_hover();
				if (!state) this._clipboardItemMenu.disconnect(signalId);
				return true;
			});
			this._clipboardItemMenu.colorsOnly = colorsOnly;
			this._clipboardItemMenu.arrowAlignment = w === 0 && h === 0 ? 0 : 0.5;
			if (w === 0 && h === 0) {
				x++;
				y++;
			}
			Main.layoutManager.setDummyCursorGeometry(x, y, w, h);
			this._clipboardItemMenu.entry = entry;
			this._clipboardItemMenu.open(BoxPointer.PopupAnimation.SLIDE);
		};
		item.connectObject(
			'open-menu',
			(_: unknown, x: number, y: number, w: number, h: number) => openMenu(false, x, y, w, h),
			'open-colors',
			(_: unknown, x: number, y: number, w: number, h: number) => openMenu(true, x, y, w, h),
			this,
		);

		// Connect activation
		item.connectObject(
			'activate',
			() => {
				const swap = this.ext.settings.get_boolean('swap-copy-shortcut');
				this.emit(swap ? 'copy' : 'paste', entry);
				this.close();
			},
			'activate-shift',
			() => {
				const swap = this.ext.settings.get_boolean('swap-copy-shortcut');
				this.emit(swap ? 'paste' : 'copy', entry);
				this.close();
			},
			'activate-ctrl',
			() => {
				if (this._clipboardItemMenu.activateDefaultAction(entry)) this.close();
			},
			'activate-action',
			(_: unknown, id: string) => {
				if (this._clipboardItemMenu.activateAction(entry, id)) this.close();
			},
			this,
		);

		return item;
	}

	public dialogShortcut() {
		const behavior = this.ext.settings.get_enum('open-clipboard-dialog-behavior');
		if (behavior === OpenClipboardDialogBehavior.Toggle) {
			this.toggle();
		} else if (behavior === OpenClipboardDialogBehavior.OpenOrSelectNext) {
			if (!this.opened) this.open();
			else this._scrollView.selectNextItem();
		}
	}

	public clearEntries() {
		this.cancelPendingLoad();
		if (this._refreshIdleId) GLib.source_remove(this._refreshIdleId);
		this._refreshIdleId = 0;
		for (const [entry, ids] of this._entrySignals) for (const id of ids) entry.disconnect(id);
		this._entrySignals.clear();
		this._entries.clear();
		this._pendingEntries = [];
		this._filters?.updateCounts(this._pendingEntries);
		this._pendingIndex = 0;
		this._renderedCount = 0;
		this._pageTarget = INITIAL_LOAD_ITEMS;
		this._scrollView.clearItems();
	}

	private openSettings() {
		this.ext.openPreferences();
		this.close();
	}

	private confirmClearHistory() {
		const dialog = new ConfirmClearHistoryDialog();
		dialog.connect('clear-history', (_dialog, history) => this.emit('clear-history', history));
		dialog.open();
	}

	private updatePosition() {
		const showAtPointer = this.ext.settings.get_boolean('show-at-pointer');
		this._orientation = this.ext.settings.get_enum('clipboard-orientation');
		const positionVertical = this.ext.settings.get_enum('clipboard-position-vertical');
		const positionHorizontal = this.ext.settings.get_enum('clipboard-position-horizontal');
		const size = this.ext.settings.get_int('clipboard-size');

		this._scrollView.orientation = this._orientation;
		this._widthConstraint.enabled = this._orientation === Clutter.Orientation.VERTICAL;
		this._fitConstraint.enabled = showAtPointer;

		if (showAtPointer) {
			this._dialog.x_align = Clutter.ActorAlign.CENTER;
			this._dialog.y_align = Clutter.ActorAlign.CENTER;
		} else {
			this._dialog.x_align = (positionHorizontal + 1) % 4;
			this._dialog.y_align = (positionVertical + 1) % 4;
		}

		if (this._orientation === Clutter.Orientation.HORIZONTAL) {
			this._dialog.add_style_class_name('horizontal');
			this._dialog.remove_style_class_name('vertical');

			this._dialog.width = size;
			this._dialog.height = -1;
		} else {
			this._dialog.remove_style_class_name('horizontal');
			this._dialog.add_style_class_name('vertical');

			this._dialog.width = -1;
			this._dialog.height = size;
		}

		// Header / Footer
		this._header.showButtons = this._orientation === Clutter.Orientation.HORIZONTAL;
		this._footer.visible = this._orientation === Clutter.Orientation.VERTICAL;
	}

	private updateMargins() {
		const top = this.ext.settings.get_int('clipboard-margin-top');
		const right = this.ext.settings.get_int('clipboard-margin-right');
		const bottom = this.ext.settings.get_int('clipboard-margin-bottom');
		const left = this.ext.settings.get_int('clipboard-margin-left');

		this._dialog.set_style(`margin: ${top}px ${right}px ${bottom}px ${left}px;`);
	}

	private updateCursor(_source: Clutter.InputMethod, rect: Graphene.Rect) {
		if (isNaN(rect.get_x()) || isNaN(rect.get_y()) || !this._updateCursor) return;

		const p = rect.get_bottom_right();
		this._nextCursor = [p.x + 4, p.y + 4];
		this._cursor = [p.x + 4, p.y + 4];
	}

	private updateFitConstraint() {
		// Update fit constraint position to current pointer position
		const showAtPointer = this.ext.settings.get_boolean('show-at-pointer');
		if (!showAtPointer) return;

		const showAtCursor = this.ext.settings.get_boolean('show-at-cursor');
		const [x, y] = (showAtCursor ? this._cursor : null) ?? global.get_pointer();

		const ws = global.workspace_manager.get_active_workspace();
		const rect = ws.get_work_area_for_monitor(this._monitorConstraint.index);

		const node = this._dialog.get_theme_node();

		this._fitConstraint.x = Math.max(0, x - rect.x - node.get_margin(St.Side.LEFT) + 1);
		this._fitConstraint.y = Math.max(0, y - rect.y - node.get_margin(St.Side.TOP) + 1);
	}

	private shouldTriggerSearch(keysym: number) {
		if (keysym === Clutter.KEY_Multi_key) return true;
		if (keysym === Clutter.KEY_BackSpace) return true;

		const unicode = Clutter.keysym_to_unicode(keysym);
		if (unicode === 0) return false;

		return String.fromCharCode(unicode).trim().length > 0;
	}

	override vfunc_key_press_event(event: Clutter.Event): boolean {
		const key = event.get_key_symbol();

		// Close on escape
		if (key === Clutter.KEY_Escape) {
			this.close();
			return Clutter.EVENT_STOP;
		}

		// Select item: ctrl + 0..9
		const isNum = key >= Clutter.KEY_0 && key <= Clutter.KEY_9;
		if (event.has_control_modifier() && (isNum || (key >= Clutter.KEY_KP_0 && key <= Clutter.KEY_KP_9))) {
			const i = isNum ? key - Clutter.KEY_1 : key - Clutter.KEY_KP_1;
			if (this._scrollView.selectItem((i + 10) % 10)) {
				this._header.updateHeader(false);
			}

			return Clutter.EVENT_STOP;
		}

		// Search on ctrl+f
		if (event.has_control_modifier() && key === Clutter.KEY_f) {
			this._header.searchEntry.grab_key_focus();
			return Clutter.EVENT_STOP;
		}

		// Trigger search
		if (!event.has_control_modifier() && this.shouldTriggerSearch(key)) {
			this._header.searchEntry.clutter_text.grab_key_focus();
			return this._header.searchEntry.clutter_text.event(event, false);
		}

		// Toggle pinned search: alt
		if (key === Clutter.KEY_Alt_L || key === Clutter.KEY_Alt_R || key === Clutter.KEY_ISO_Level3_Shift) {
			this._header.searchEntry.pinned = !this._header.searchEntry.pinned;
			return Clutter.EVENT_STOP;
		}

		// Select tag: ctrl + shift + 0..9
		const code = event.get_key_code();
		if (event.has_control_modifier() && event.has_shift_modifier() && code >= 10 && code <= 19) {
			this._header.searchEntry.selectTag(code - 10);
			return Clutter.EVENT_STOP;
		}

		// Next tag: ctrl + `
		if (event.has_control_modifier() && key === Clutter.KEY_grave) {
			this._header.searchEntry.nextTag();
			return Clutter.EVENT_STOP;
		}

		// Previous tag: ctrl + shift + `
		if (event.has_control_modifier() && key === Clutter.KEY_asciitilde) {
			this._header.searchEntry.prevTag();
			return Clutter.EVENT_STOP;
		}

		// Next type: ctrl + tab
		if (event.has_control_modifier() && key === Clutter.KEY_Tab) {
			this._header.searchEntry.nextType();
			return Clutter.EVENT_STOP;
		}

		// Previous type: ctrl + shift + tab
		if (event.has_control_modifier() && key === Clutter.KEY_ISO_Left_Tab) {
			this._header.searchEntry.prevType();
			return Clutter.EVENT_STOP;
		}

		// Navigate
		if (VERSION < 51 && global.focus_manager.navigate_from_event(event)) return Clutter.EVENT_STOP;

		return super.vfunc_key_press_event(event);
	}

	override vfunc_button_press_event(event: Clutter.Event): boolean {
		const [x, y] = event.get_coords();
		if (this._dialog.get_transformed_extents().contains_point(new Graphene.Point({ x, y }))) {
			return Clutter.EVENT_PROPAGATE;
		}

		this.close();
		return Clutter.EVENT_STOP;
	}

	override vfunc_touch_event(event: Clutter.Event): boolean {
		if (event.type() !== Clutter.EventType.TOUCH_BEGIN) return Clutter.EVENT_PROPAGATE;

		const [x, y] = event.get_coords();
		if (this._dialog.get_transformed_extents().contains_point(new Graphene.Point({ x, y }))) {
			return Clutter.EVENT_PROPAGATE;
		}

		this.close();
		return Clutter.EVENT_STOP;
	}

	override vfunc_map(): void {
		super.vfunc_map();

		// Update fit constraint
		this.updateFitConstraint();

		// Navigate to first item
		if (!this._scrollView.navigate_focus(null, St.DirectionType.DOWN, false)) {
			this._header.updateHeader(true, false);
			this._header.searchEntry.grab_key_focus();
		}
	}
}
