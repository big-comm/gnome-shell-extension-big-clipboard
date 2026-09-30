import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { ItemType } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { Icon, loadIcon } from '../../common/icons.js';
import type { ClipboardEntry } from '../../database/database.js';
import { WrapLayout } from '../layout.js';
import type { SearchEntry } from '../searchEntry.js';

@registerClass()
export class TypeFilters extends St.Widget {
	private readonly _buttons: { type: ItemType | null; button: St.Button; count: St.Label }[] = [];

	constructor(
		ext: CopyousExtension,
		private search: SearchEntry,
	) {
		super({
			style_class: 'clipboard-type-filters',
			x_expand: true,
			request_mode: Clutter.RequestMode.HEIGHT_FOR_WIDTH,
			layout_manager: new WrapLayout(),
		});
		const types: [ItemType | null, string, Icon][] = [
			[null, _('All'), Icon.Clipboard],
			[ItemType.Text, _('Text'), Icon.Text],
			[ItemType.Code, _('Code'), Icon.Code],
			[ItemType.Image, _('Images'), Icon.Image],
			[ItemType.File, _('Files'), Icon.File],
			[ItemType.Link, _('Links'), Icon.Link],
		];
		for (const [type, label, icon] of types) {
			const box = new St.BoxLayout({ style_class: 'filter-content' });
			box.add_child(new St.Icon({ gicon: loadIcon(ext, icon), icon_size: 14 }));
			box.add_child(new St.Label({ text: label }));
			const count = new St.Label({ text: '0', style_class: 'filter-count' });
			box.add_child(count);
			const button = new St.Button({
				child: box,
				accessible_name: label,
				style_class: 'button',
				can_focus: true,
				toggle_mode: true,
			});
			button.connect('clicked', () => {
				search.type = type;
			});
			this.add_child(button);
			this._buttons.push({ type, button, count });
		}
		const pinned = new St.Button({ label: _('Pinned'), style_class: 'button', can_focus: true, toggle_mode: true });
		pinned.connect('clicked', () => {
			search.pinned = !search.pinned;
		});
		this.add_child(pinned);
		const update = () => {
			for (const { type, button } of this._buttons) button.checked = search.type === type;
			pinned.checked = search.pinned;
		};
		search.connectObject('notify::type', update, 'notify::pinned', update, this);
		update();
	}

	updateCounts(entries: ClipboardEntry[]) {
		const counts = new Map<ItemType | null, number>([[null, entries.length]]);
		for (const entry of entries) {
			const type = entry.type === ItemType.Files ? ItemType.File : entry.type;
			counts.set(type, (counts.get(type) ?? 0) + 1);
		}
		for (const { type, count } of this._buttons) count.text = (counts.get(type) ?? 0).toLocaleString();
	}

	override destroy() {
		this.search.disconnectObject(this);
		super.destroy();
	}
}
