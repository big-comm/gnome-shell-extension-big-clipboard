import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { int32ParamSpec, registerClass } from '../common/gjs.js';

@registerClass({
	Properties: {
		source: GObject.ParamSpec.object('source', null, null, GObject.ParamFlags.READWRITE, Clutter.Actor),
		x: int32ParamSpec('x', GObject.ParamFlags.READWRITE, 0),
		y: int32ParamSpec('y', GObject.ParamFlags.READWRITE, 0),
	},
})
export class FitConstraint extends Clutter.Constraint {
	private _source: Clutter.Actor;
	private _x: number = 0;
	private _y: number = 0;

	constructor(source: Clutter.Actor, enabled: boolean) {
		super({
			enabled: enabled,
		});

		this._source = source;
	}

	get source() {
		return this._source;
	}

	set source(source: Clutter.Actor) {
		this._source = source;
		if (this.actor) this.actor.queue_relayout();
		this.notify('source');
	}

	get x() {
		return this._x;
	}

	set x(x: number) {
		this._x = x;
		if (this.actor) this.actor.queue_relayout();
		this.notify('x');
	}

	get y() {
		return this._y;
	}

	set y(y: number) {
		this._y = y;
		if (this.actor) this.actor.queue_relayout();
		this.notify('y');
	}

	override vfunc_update_allocation(_actor: Clutter.Actor, allocation: Clutter.ActorBox): void {
		const [width, height] = allocation.get_size();
		const [sw, sh] = this.source.allocation.get_size();

		const x = Math.max(0, Math.min(this.x, sw - width));
		const y = Math.max(0, Math.min(this.y, sh - height));
		allocation.set_origin(x, y);
	}
}

@registerClass({
	Properties: {
		'expansion': GObject.ParamSpec.double('expansion', null, null, GObject.ParamFlags.READWRITE, 0, 1, 1),
		'enable-collapse': GObject.ParamSpec.boolean('enable-collapse', null, null, GObject.ParamFlags.READWRITE, true),
	},
})
export class CollapsibleHeaderLayout extends Clutter.BinLayout {
	private _expansion: number = 1;
	private _enableCollapse: boolean = true;

	get expansion() {
		return this._expansion;
	}

	set expansion(value: number) {
		if (this._expansion === value) return;
		this._expansion = value;
		this.notify('expansion');

		this.layout_changed();
	}

	get enableCollapse() {
		return this._enableCollapse;
	}

	set enableCollapse(value: boolean) {
		if (this._enableCollapse === value) return;
		this._enableCollapse = value;
		this.notify('enable-collapse');
		this.layout_changed();
	}

	override vfunc_get_preferred_height(container: Clutter.Actor, for_width: number): [number, number] {
		let [min, nat] = [0, 0];

		const child = container.first_child;
		if (child) {
			[min, nat] = child.get_preferred_height(for_width);

			if (this._enableCollapse) {
				min *= this._expansion;
				nat *= this._expansion;
			}
		}

		return [Math.floor(min), Math.floor(nat)];
	}

	override vfunc_allocate(container: Clutter.Actor, allocation: Clutter.ActorBox): void {
		const child = container.first_child;
		if (child) {
			const [_cmin, cnat] = child.get_preferred_height(allocation.get_width());

			const delta = Math.min(allocation.get_height() - cnat, 0);
			const y = allocation.y1 + delta;
			const box = Clutter.ActorBox.new(allocation.x1, y, allocation.x2, y + cnat);
			child.allocate(box);
		}
	}
}

@registerClass({
	Properties: {
		'center-widget': GObject.ParamSpec.object(
			'center-widget',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			Clutter.Actor,
		),
	},
})
export class CenterBox extends St.Widget {
	private readonly _startWidget: St.BoxLayout;
	private _centerWidget: Clutter.Actor | null = null;
	private readonly _endWidget: St.BoxLayout;

	constructor(props: Partial<St.Widget.ConstructorProps>) {
		super(props);

		this._startWidget = new St.BoxLayout();
		this.add_child(this._startWidget);
		this._endWidget = new St.BoxLayout();
		this.add_child(this._endWidget);
	}

	get centerWidget() {
		return this._centerWidget;
	}

	set centerWidget(centerWidget: Clutter.Actor | null) {
		if (this._centerWidget) this.remove_child(this._centerWidget);
		if (centerWidget) this.insert_child_above(centerWidget, this._startWidget);
		this._centerWidget = centerWidget;
		this.notify('center-widget');
		this.queue_relayout();
	}

	addPrefix(actor: Clutter.Actor) {
		this._startWidget.add_child(actor);
		this.queue_relayout();
	}

	addSuffix(actor: Clutter.Actor) {
		this._endWidget.add_child(actor);
		this.queue_relayout();
	}

	override vfunc_navigate_focus(from: Clutter.Actor | null, direction: St.DirectionType): boolean {
		if (direction === St.DirectionType.TAB_FORWARD || direction === St.DirectionType.TAB_BACKWARD) {
			return super.vfunc_navigate_focus(from, direction);
		}

		let focusChild = from;
		while (focusChild && focusChild.get_parent() !== this) focusChild = focusChild.get_parent();

		if (focusChild === null) {
			this._centerWidget?.grab_key_focus();
			return Clutter.EVENT_STOP;
		}

		if (this._startWidget.get_focus_chain().includes(focusChild)) {
			if (direction === St.DirectionType.RIGHT) {
				this._centerWidget?.grab_key_focus();
				return Clutter.EVENT_STOP;
			}
		} else if (this._centerWidget === focusChild) {
			if (direction === St.DirectionType.LEFT) {
				return this._startWidget.navigate_focus(from, direction, false);
			} else if (direction === St.DirectionType.RIGHT) {
				return this._endWidget.navigate_focus(from, direction, true);
			}
		} else if (this._endWidget.get_focus_chain().includes(focusChild)) {
			if (direction === St.DirectionType.LEFT) {
				this._centerWidget?.grab_key_focus();
				return Clutter.EVENT_STOP;
			}
		}

		return super.vfunc_navigate_focus(from, direction);
	}

	override vfunc_get_preferred_height(_for_width: number): [number, number] {
		const [startMin, startNat] = this._startWidget.get_preferred_height(-1);
		const [centerMin, centerNat] = this.centerWidget?.visible ? this.centerWidget.get_preferred_height(-1) : [0, 0];
		const [endMin, endNat] = this._endWidget.get_preferred_height(-1);

		const padding = this.get_theme_node().get_vertical_padding();
		const min = Math.max(startMin, centerMin, endMin) + padding;
		const nat = Math.max(startNat, centerNat, endNat) + padding;
		return [min, nat];
	}

	override vfunc_allocate(box: Clutter.ActorBox) {
		super.vfunc_allocate(box);

		const themeNode = this.get_theme_node();
		const content = themeNode.get_content_box(box);
		const width = content.get_width();
		const height = content.get_height();

		const [startMin, startNat] = this._startWidget.get_preferred_width(height);
		const [centerMin, centerNat] = this.centerWidget?.visible
			? this.centerWidget.get_preferred_width(height)
			: [0, 0];
		const [endMin, endNat] = this._endWidget.get_preferred_width(height);

		const centerWidth = Math.clamp(width - startMin - endMin, centerMin, centerNat);
		const startWidth = Math.clamp(width - centerWidth - endNat, startMin, startNat);
		const endWidth = Math.clamp(width - centerWidth - startWidth, endMin, endNat);

		const y1 = content.y1;
		const y2 = content.y2;
		const startBox = new Clutter.ActorBox({ x1: content.x1, y1, x2: content.x1 + startWidth, y2 });
		this._startWidget.allocate(startBox);

		const centerX = Math.max(content.x1 + (width - centerWidth) / 2, startBox.x2);
		const centerBox = new Clutter.ActorBox({ x1: centerX, y1, x2: centerX + centerWidth, y2 });
		this.centerWidget?.allocate(centerBox);

		const endX = Math.max(content.x2 - endWidth, centerBox.x2);
		const endBox = new Clutter.ActorBox({ x1: endX, y1, x2: endX + endWidth, y2 });
		this._endWidget.allocate(endBox);
	}
}

/** Wrap controls without relying on FlowLayout's cached unconstrained row sizes. */
@registerClass()
export class WrapLayout extends Clutter.LayoutManager {
	private rows(container: Clutter.Actor, width: number) {
		const gap = 6 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
		const rows: { children: { actor: Clutter.Actor; width: number }[]; width: number; height: number }[] = [];
		for (const actor of container.get_children().filter((child) => child.visible)) {
			const natural = actor.get_preferred_width(-1)[1];
			const childWidth = width < 0 ? natural : Math.min(natural, Math.max(0, width));
			let row = rows.at(-1);
			if (!row || (width >= 0 && row.width + gap + childWidth > width)) {
				row = { children: [], width: 0, height: 0 };
				rows.push(row);
			}
			row.width += (row.children.length ? gap : 0) + childWidth;
			row.height = Math.max(row.height, actor.get_preferred_height(childWidth)[1]);
			row.children.push({ actor, width: childWidth });
		}
		return { rows, gap };
	}

	override vfunc_get_preferred_width(container: Clutter.Actor, _height: number): [number, number] {
		const { rows } = this.rows(container, -1);
		return [0, rows[0]?.width ?? 0];
	}

	override vfunc_get_preferred_height(container: Clutter.Actor, width: number): [number, number] {
		const { rows, gap } = this.rows(container, width);
		const height = rows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, rows.length - 1) * gap;
		return [height, height];
	}

	override vfunc_allocate(container: Clutter.Actor, box: Clutter.ActorBox) {
		const { rows, gap } = this.rows(container, box.get_width());
		const rtl = container.get_text_direction() === Clutter.TextDirection.RTL;
		let y = box.y1;
		for (const row of rows) {
			let x = rtl ? box.x2 : box.x1;
			for (const child of row.children) {
				const left = rtl ? x - child.width : x;
				child.actor.allocate(Clutter.ActorBox.new(left, y, left + child.width, y + row.height));
				x += (rtl ? -1 : 1) * (child.width + gap);
			}
			y += row.height + gap;
		}
	}
}
