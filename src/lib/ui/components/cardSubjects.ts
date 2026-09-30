import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { registerClass } from '../../common/gjs.js';
import { Icon, loadIcon } from '../../common/icons.js';
import { actionHint } from './actionHint.js';

/** A single row whose overflow never displaces the card actions. */
@registerClass()
export class CardSubjects extends St.Widget {
	private _names: string[] = [];
	private _chips: St.Button[] = [];
	private _more: St.Button;
	private readonly _add: St.Button;

	constructor(
		private readonly ext: CopyousExtension,
		private readonly edit: () => void,
	) {
		super({ style_class: 'clipboard-item-subjects', x_expand: true, clip_to_allocation: true });
		this._more = this.createChip('');
		this._add = new St.Button({
			style_class: 'clipboard-subject-add',
			can_focus: true,
			accessible_name: _('Subjects'),
		});
		this._add.connect('clicked', edit);
		actionHint(this._add, _('Subjects'));
		this.add_child(this._add);
	}

	private createChip(text: string) {
		const label = new St.Label({ text });
		label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
		const chip = new St.Button({ child: label, style_class: 'clipboard-subject', can_focus: true });
		chip.connect('clicked', this.edit);
		this.add_child(chip);
		return chip;
	}

	set names(names: string[]) {
		for (const chip of this._chips) chip.destroy();
		this._names = names;
		this._add.child = new St.Icon({ gicon: loadIcon(this.ext, names.length ? Icon.Add : Icon.Tag), icon_size: 14 });
		this._chips = names.slice(0, 2).map((name) => this.createChip(name));
		for (const chip of [...this._chips, this._more]) chip.accessible_name = names.join(', ');
		this._more.visible = names.length > 2;
		this.queue_relayout();
	}

	override vfunc_get_preferred_width(_height: number): [number, number] {
		return [0, 0];
	}

	override vfunc_get_preferred_height(_width: number): [number, number] {
		const height = Math.max(
			0,
			...[...this._chips, this._more, this._add].map((chip) => chip.get_preferred_height(-1)[1]),
		);
		return [height, height];
	}

	override vfunc_allocate(box: Clutter.ActorBox) {
		this.set_allocation(box);
		const fullWidth = box.get_width();
		const height = box.get_height();
		const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
		const gap = 4 * scale;
		const addWidth = this._add.get_preferred_width(-1)[1];
		const width = Math.max(0, fullWidth - addWidth - (this._names.length ? gap : 0));
		let count = this._chips.length;
		let moreWidth = 0;
		while (count >= 0) {
			moreWidth = this._names.length > count ? Math.max(42 * scale, this._more.get_preferred_width(-1)[1]) : 0;
			const minimum = this._chips
				.slice(0, count)
				.reduce((sum, chip) => sum + Math.min(40 * scale, chip.get_preferred_width(-1)[1]), 0);
			if (count === 0 || minimum + moreWidth + gap * Math.max(0, count - (moreWidth ? 0 : 1)) <= width) break;
			count--;
		}
		(this._more.child as St.Label).text = `+${this._names.length - count}`;
		const rtl = this.get_text_direction() === Clutter.TextDirection.RTL;
		let x = 0;
		let remaining = Math.max(0, width - moreWidth - gap * Math.max(0, count - (moreWidth ? 0 : 1)));
		for (let i = 0; i < this._chips.length; i++) {
			const chip = this._chips[i]!;
			chip.visible = i < count;
			if (!chip.visible) continue;
			const w = Math.min(chip.get_preferred_width(-1)[1], remaining / (count - i));
			const left = rtl ? fullWidth - x - w : x;
			chip.allocate(Clutter.ActorBox.new(left, 0, left + w, height));
			x += w + gap;
			remaining -= w;
		}
		this._more.visible = this._names.length > count;
		if (this._more.visible) {
			const w = Math.min(moreWidth, width);
			const left = rtl ? fullWidth - x - w : x;
			this._more.allocate(Clutter.ActorBox.new(left, 0, left + w, height));
			x += w + gap;
		}
		const addLeft = rtl ? fullWidth - x - addWidth : x;
		this._add.allocate(Clutter.ActorBox.new(addLeft, 0, addLeft + addWidth, height));
	}
}
