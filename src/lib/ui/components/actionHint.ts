import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/** Lazily created hint; hidden between uses and destroyed with its button. */
export function actionHint(button: St.Button, text: string) {
	let source = 0;
	let label: St.Label | null = null;
	const hide = () => {
		if (source) GLib.source_remove(source);
		source = 0;
		label?.hide();
	};
	const show = () => {
		hide();
		source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
			source = 0;
			if (!button.mapped) return GLib.SOURCE_REMOVE;
			const monitor = Main.layoutManager.findMonitorForActor(button);
			if (!monitor) return GLib.SOURCE_REMOVE;
			if (!label) {
				label = new St.Label({ text, style_class: 'dash-label', reactive: false, visible: false });
				Main.layoutManager.uiGroup.add_child(label);
			}
			const [x, y] = button.get_transformed_position();
			const [, w] = label.get_preferred_width(-1);
			const [, h] = label.get_preferred_height(w);
			label.set_position(
				Math.max(monitor.x, Math.min(x + (button.width - w) / 2, monitor.x + monitor.width - w)),
				Math.max(monitor.y, y - h - 6),
			);
			if (button.mapped && (button.hover || button.has_key_focus())) label.show();
			return GLib.SOURCE_REMOVE;
		});
	};
	button.track_hover = true;
	button.connect('notify::hover', () => (button.hover ? show() : hide()));
	button.connect('key-focus-in', show);
	button.connect('key-focus-out', hide);
	button.connect('notify::mapped', () => {
		if (!button.mapped) hide();
	});
	button.connect('clicked', hide);
	button.connect('destroy', () => {
		hide();
		label?.destroy();
		label = null;
	});
}
