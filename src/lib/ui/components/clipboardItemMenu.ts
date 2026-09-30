import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type CopyousExtension from '../../../extension.js';
import { ItemType, Tags } from '../../common/constants.js';
import { ClipboardEntry } from '../../database/database.js';
import { Shortcut } from '../../misc/shortcuts.js';
import { ActionPopupMenuSection, ActionPopupMenuSectionSignals } from './actionMenu.js';
import { EditDialog } from './editDialog.js';
import { TagsItem } from './tagsItem.js';

function canEdit(entry: ClipboardEntry): boolean {
	return entry.type === ItemType.Text || entry.type === ItemType.Code;
}

export class ClipboardItemMenu extends PopupMenu.PopupMenu<ActionPopupMenuSectionSignals> {
	declare private _arrowAlignment: number;
	private _entry: ClipboardEntry | null = null;

	private readonly _tagsItem: TagsItem;
	private _colorsOnly = false;
	private readonly _actionMenuSection: ActionPopupMenuSection;

	constructor(private ext: CopyousExtension) {
		super(Main.layoutManager.dummyCursor, 0, St.Side.TOP);

		this.actor.add_style_class_name('clipboard-item-menu');

		// Tags
		this._tagsItem = new TagsItem();
		this.addMenuItem(this._tagsItem);

		this._tagsItem.connect('tag-changed', () => this.close(BoxPointer.PopupAnimation.FADE));
		this._tagsItem.connect('notify::tag', () => {
			if (this._entry) {
				this._entry.tag = this._tagsItem.tag;
			}
		});

		// Action menu
		this._actionMenuSection = new ActionPopupMenuSection(ext);
		this.addMenuItem(this._actionMenuSection);

		this._actionMenuSection.connectObject(
			'activate',
			(_menu: unknown, e: Clutter.Event) => this.emit('activate', e),
			'copy',
			(_menu: unknown, s: string) => this.emit('copy', s),
			'paste',
			(_menu: unknown, s: string) => this.emit('paste', s),
			this,
		);

		// Add to ui
		Main.layoutManager.uiGroup.add_child(this.actor);
		this.actor.hide();

		this.actor.connect('captured-event', (_actor, event: Clutter.Event) => {
			if (event.type() === Clutter.EventType.KEY_PRESS) {
				const key = event.get_key_symbol();

				// Select tag with number
				if (this._colorsOnly && key === Clutter.KEY_0) {
					this._tagsItem.tag = null;
					this.close(BoxPointer.PopupAnimation.FADE);
					return;
				}

				if (this._colorsOnly && key >= Clutter.KEY_1 && key <= Clutter.KEY_9) {
					let tag = Tags[key - Clutter.KEY_1] ?? null;
					tag = this._tagsItem.tag === tag ? null : tag;
					this._tagsItem.tag = tag;
					this.close(BoxPointer.PopupAnimation.FADE);
					return;
				}

				// Allow action menu to be closed with the action menu shortcut
				const action = ext.shortcutsManager?.getShortcutForKeyBinding(key, event.get_state());

				if (action === Shortcut.Menu) {
					this.close(BoxPointer.PopupAnimation.FADE);
				}
			}
		});
	}

	set colorsOnly(value: boolean) {
		this._colorsOnly = value;
		this._tagsItem.visible = value;
		this._actionMenuSection.actor.visible = !value;
	}

	set arrowAlignment(alignment: number) {
		this._arrowAlignment = alignment;
	}

	set entry(entry: ClipboardEntry) {
		this._entry = entry;
		this._actionMenuSection.entry = entry;

		this._tagsItem.tag = entry.tag;
	}

	public edit(entry: ClipboardEntry) {
		if (canEdit(entry)) {
			const editDialog = new EditDialog(this.ext, entry);
			editDialog.open();
		}
	}

	public activateDefaultAction(entry: ClipboardEntry): boolean {
		return this._actionMenuSection.activateDefaultAction(entry);
	}

	public activateAction(entry: ClipboardEntry, id: string): boolean {
		return this._actionMenuSection.activateAction(entry, id);
	}
}
