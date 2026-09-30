import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type CopyousExtension from '../../../extension.js';
import { ItemType } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { Icon, loadIcon } from '../../common/icons.js';
import { normalizeSubjects } from '../../common/subjects.js';
import { ClipboardEntry, CodeMetadata, Language } from '../../database/database.js';
import { type MarkdownAction, formatMarkdown, markdownPreview } from './markdown.js';
import { subjectInput } from './subjectsDialog.js';

/** Entry with proper height for multiline text and event forwarding */
@registerClass()
export class Entry extends St.Entry {
	constructor(props: Partial<St.Entry.ConstructorProps>) {
		super(props);
	}

	override vfunc_get_preferred_height(for_width: number): [number, number] {
		return this.clutter_text.get_preferred_height(for_width);
	}

	override vfunc_button_press_event(event: Clutter.Event): boolean {
		if (event.get_button() === Clutter.BUTTON_PRIMARY && !this.clutter_text.has_key_focus()) {
			this.clutter_text.grab_key_focus();
		}

		return this.clutter_text.vfunc_button_press_event(event);
	}

	override vfunc_button_release_event(event: Clutter.Event): boolean {
		return this.clutter_text.vfunc_button_release_event(event);
	}

	override vfunc_key_press_event(event: Clutter.Event): boolean {
		const key = event.get_key_symbol();
		if (event.has_control_modifier()) {
			if (key === Clutter.KEY_Home) {
				const end = event.has_shift_modifier() ? this.clutter_text.cursor_position : 0;
				this.clutter_text.set_selection(0, end);
				return Clutter.EVENT_STOP;
			}

			if (key === Clutter.KEY_End) {
				const start = event.has_shift_modifier() ? this.clutter_text.cursor_position : -1;
				this.clutter_text.set_selection(start, -1);
				return Clutter.EVENT_STOP;
			}

			if (key === Clutter.KEY_Tab) {
				this.clutter_text.insert_text('\t', this.clutter_text.cursor_position);
				return Clutter.EVENT_STOP;
			}
		}

		return super.vfunc_key_press_event(event);
	}

	override vfunc_motion_event(event: Clutter.Event): boolean {
		this.updateHover();
		return this.clutter_text.vfunc_motion_event(event);
	}

	private updateHover() {
		this.sync_hover();
		if (this.hover) {
			global.display.set_cursor(Meta.Cursor.TEXT);
		} else {
			global.display.set_cursor(Meta.Cursor.DEFAULT);
		}
	}
}

/**
 * Work around for St.Entry not properly supporting multiline mode. Extends St.Entry to follow system theme.
 */
@registerClass()
export class MultilineEntry extends St.Entry {
	constructor(props: Partial<St.Bin.ConstructorProps>) {
		super({ reactive: true, ...props });

		const text = this.clutter_text;
		this.remove_child(text);

		const scrollView = new St.ScrollView({
			style_class: 'multiline-scrollview',
			hscrollbar_policy: St.PolicyType.NEVER,
			vscrollbar_policy: St.PolicyType.AUTOMATIC,
			x_align: Clutter.ActorAlign.FILL,
			y_align: Clutter.ActorAlign.FILL,
			x_expand: true,
			y_expand: true,
			clip_to_allocation: true,
		});
		this.add_child(scrollView);

		const box = new St.BoxLayout({
			style_class: 'multiline-box',
			orientation: Clutter.Orientation.VERTICAL,
			x_align: Clutter.ActorAlign.FILL,
			y_align: Clutter.ActorAlign.FILL,
			x_expand: true,
			y_expand: true,
		});
		scrollView.child = box;

		box.add_child(text);

		text.single_line_mode = false;
		text.activatable = false;
		text.line_wrap = true;
		text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
		text.x_align = Clutter.ActorAlign.FILL;
		text.y_align = Clutter.ActorAlign.START;
		text.x_expand = true;
		text.y_expand = true;

		// St.Entry's single-line navigation does not handle document boundaries.
		text.connect('key-press-event', (_actor, event: Clutter.Event) => {
			if (!event.has_control_modifier()) return Clutter.EVENT_PROPAGATE;
			const key = event.get_key_symbol();
			if (key !== Clutter.KEY_Home && key !== Clutter.KEY_End) return Clutter.EVENT_PROPAGATE;
			const position = key === Clutter.KEY_Home ? 0 : -1;
			const anchor = event.has_shift_modifier() ? text.selection_bound : position;
			text.set_selection(position, anchor);
			return Clutter.EVENT_STOP;
		});

		// Always keep the cursor visible
		text.connect('cursor-changed', () => {
			const [success, x, y, h] = text.position_to_coords(text.cursor_position);
			if (success) {
				if (x > box.allocation.get_width()) return;

				const y1 = box.vadjustment.value;
				const y2 = y1 + box.vadjustment.page_size;
				if (y < y1) {
					box.vadjustment.value = y;
				} else if (y > y2 - h) {
					box.vadjustment.value = y - box.vadjustment.page_size + h;
				}
			}
		});
	}

	override vfunc_allocate(box: Clutter.ActorBox) {
		super.vfunc_allocate(box);

		const contentBox = this.get_theme_node().get_content_box(box);
		this.first_child.allocate(contentBox);
	}
}

export class ScrollablePopupMenuSection extends PopupMenu.PopupMenuSection {
	constructor() {
		super();

		// @ts-expect-error actor cannot be reassigned
		this.actor = new St.ScrollView({
			style_class: 'scrollable-popup-menu-section',
			child: this.box,
			overlay_scrollbars: true,
		});
	}
}

export type LanguagePopupMenuSignals = {
	language: [Language];
};

export class LanguagePopupMenu extends PopupMenu.PopupMenu<LanguagePopupMenuSignals> {
	constructor(ext: CopyousExtension, sourceActor: St.Widget, arrowAlignment: number, arrowSide: St.Side) {
		super(sourceActor, arrowAlignment, arrowSide);

		this.actor.add_style_class_name('language-popupmenu');

		this.actor.hide();
		Main.layoutManager.uiGroup.add_child(this.actor);

		const section = new ScrollablePopupMenuSection();
		this.addMenuItem(section);

		if (ext.hljs) {
			const languages = ext.hljs
				.listLanguages()
				.map((language) => {
					return {
						id: language,
						name: ext.hljs?.getLanguage(language)?.name ?? language,
					};
				})
				.sort((a, b) => a.name.localeCompare(b.name));

			for (const language of languages) {
				section.addAction(language.name, () => this.emit('language', language));
			}
		}
	}
}

@registerClass({
	Properties: {
		language: GObject.ParamSpec.jsobject('language', null, null, GObject.ParamFlags.READWRITE),
	},
})
export class LanguageButton extends St.Button {
	private _language: Language | null;

	private readonly _label: St.Label;
	private readonly _popupMenu: LanguagePopupMenu;

	constructor(ext: CopyousExtension, language: Language | null) {
		super({
			style_class: 'language-button modal-dialog-button',
			reactive: true,
			can_focus: true,
			x_expand: true,
		});

		this._language = language;

		const box = new St.BoxLayout({
			x_expand: true,
		});
		this.child = box;

		this._label = new St.Label({
			text: language?.name ?? _('None'),
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
		});
		box.add_child(this._label);

		box.add_child(
			new St.Icon({
				gicon: loadIcon(ext, Icon.Down),
				icon_size: 20,
				x_align: Clutter.ActorAlign.END,
			}),
		);

		this._popupMenu = new LanguagePopupMenu(ext, this, 0.5, St.Side.TOP);
		const menuManager = new PopupMenu.PopupMenuManager(this);
		menuManager.addMenu(this._popupMenu, 0);

		this._popupMenu.connectObject('language', (_obj: unknown, l: Language) => (this.language = l), this);
	}

	get language() {
		return this._language;
	}

	set language(language: Language | null) {
		this._language = language;
		this._label.text = language?.name ?? _('None');
	}

	override vfunc_clicked(_clicked_button: number) {
		this._popupMenu.open(BoxPointer.PopupAnimation.FULL);
	}

	override destroy() {
		this._popupMenu.destroy();
		super.destroy();
	}
}

@registerClass()
export class EditDialog extends ModalDialog.ModalDialog {
	private readonly _entry: MultilineEntry;
	private readonly _languageButton?: LanguageButton;
	private _preview?: St.ScrollView;
	private _previewLabel?: St.Label;
	private _previewNotice?: St.Label;
	private _toolbar?: St.BoxLayout;
	private _editButton?: St.Button;
	private _previewButton?: St.Button;

	constructor(ext: CopyousExtension, entry: ClipboardEntry) {
		super({
			styleClass: 'clipboard-item-edit-dialog',
			destroyOnClose: true,
		});

		const content = new Dialog.MessageDialogContent({
			title: _('Edit Clipboard Item'),
		});
		this.contentLayout.add_child(content);

		if (entry.type === ItemType.Code) {
			const box = new St.Widget({
				style_class: 'modal-dialog-button-box modal-dialog-top-button-box',
				x_expand: true,
				layout_manager: new Clutter.BoxLayout({
					spacing: 12,
					homogeneous: true,
				}),
			});
			content.add_child(box);

			const metadata = { language: null, ...entry.metadata } as CodeMetadata;
			this._languageButton = new LanguageButton(ext, metadata.language);
			box.add_child(this._languageButton);
		}

		content.add_child(new St.Label({ text: _('Subjects') }));
		const subjects = subjectInput(entry.subjects);
		content.add_child(subjects);
		if (entry.type === ItemType.Text) this.addMarkdownTools(content);

		// Entry
		this._entry = new MultilineEntry({
			style_class: 'clipboard-item-edit-dialog-entry',
			can_focus: true,
			x_expand: true,
		});
		content.add_child(this._entry);
		this.setInitialKeyFocus(this._entry);

		this._entry.clutter_text.text = entry.content;
		this._entry.clutter_text.set_selection(-1, -1);
		if (entry.type === ItemType.Text) {
			this._previewLabel = new St.Label({ style_class: 'markdown-preview-text', x_expand: true });
			this._previewLabel.clutter_text.line_wrap = true;
			this._previewLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
			this._previewLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
			const box = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
			box.add_child(this._previewLabel);
			this._preview = new St.ScrollView({
				style_class: 'markdown-preview',
				visible: false,
				x_expand: true,
				hscrollbar_policy: St.PolicyType.NEVER,
				vscrollbar_policy: St.PolicyType.AUTOMATIC,
				child: box,
			});
			content.add_child(this._preview);
			this._previewNotice = new St.Label({
				text: _('Preview shortened. The full text is preserved.'),
				visible: false,
			});
			content.add_child(this._previewNotice);
			this._entry.clutter_text.connect('key-press-event', (_actor, event: Clutter.Event) => {
				if (!event.has_control_modifier() || event.get_state() & Clutter.ModifierType.MOD1_MASK)
					return Clutter.EVENT_PROPAGATE;
				const key = event.get_key_symbol();
				if (key === Clutter.KEY_b || key === Clutter.KEY_B) {
					this.applyFormat('bold');
					return Clutter.EVENT_STOP;
				}
				if (key === Clutter.KEY_i || key === Clutter.KEY_I) {
					this.applyFormat('italic');
					return Clutter.EVENT_STOP;
				}
				return Clutter.EVENT_PROPAGATE;
			});
		}

		if (entry.type === ItemType.Code) {
			this._entry.add_style_class_name('monospace');
		}

		// Buttons
		this.addButton({
			label: _('Cancel'),
			action: () => this.close(),
			default: true,
			key: Clutter.KEY_Escape,
		});

		this.addButton({
			label: _('Save'),
			action: () => {
				entry.subjects = normalizeSubjects(subjects.text);
				entry.content = this._entry.clutter_text.text;
				if (this._languageButton) entry.metadata = { language: this._languageButton.language };
				this.close();
			},
		});
	}

	private addMarkdownTools(content: St.BoxLayout) {
		const tabs = new St.BoxLayout({ style_class: 'markdown-tabs' });
		this._editButton = new St.Button({
			label: _('Edit'),
			style_class: 'button',
			can_focus: true,
			toggle_mode: true,
			checked: true,
		});
		this._previewButton = new St.Button({
			label: _('Preview'),
			style_class: 'button',
			can_focus: true,
			toggle_mode: true,
		});
		this._editButton.connect('clicked', () => this.showPreview(false));
		this._previewButton.connect('clicked', () => this.showPreview(true));
		tabs.add_child(this._editButton);
		tabs.add_child(this._previewButton);
		content.add_child(tabs);
		this._toolbar = new St.BoxLayout({ style_class: 'markdown-toolbar' });
		const hint = new St.Label({
			text: _('Markdown formatting'),
			style_class: 'markdown-hint',
			y_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
		});
		hint.clutter_text.ellipsize = Pango.EllipsizeMode.END;
		const actions: [MarkdownAction, string, string][] = [
			['bold', 'B', _('Bold (Ctrl+B)')],
			['italic', 'I', _('Italic (Ctrl+I)')],
			['bullet', '•', _('Bullet list')],
			['number', '1.', _('Numbered list')],
			['quote', '❯', _('Quote')],
			['code', '</>', _('Inline code')],
			['link', '↗', _('Link')],
		];
		for (const [action, label, name] of actions) {
			const button = new St.Button({
				label,
				accessible_name: name,
				style_class: `button markdown-${action}`,
				can_focus: true,
				track_hover: true,
			});
			button.connect('clicked', () => this.applyFormat(action));
			button.connect('notify::hover', () => {
				hint.text = button.hover ? name : _('Markdown formatting');
			});
			button.connect('key-focus-in', () => {
				hint.text = name;
			});
			this._toolbar.add_child(button);
		}
		this._toolbar.add_child(hint);
		content.add_child(this._toolbar);
	}

	private applyFormat(action: MarkdownAction) {
		const text = this._entry.clutter_text;
		const result = formatMarkdown(text.text, text.cursor_position, text.selection_bound, action);
		text.text = result.text;
		text.grab_key_focus();
		text.set_selection(result.start, result.end);
	}

	private showPreview(preview: boolean) {
		if (!this._preview || !this._previewLabel) return;
		if (preview) {
			const result = markdownPreview(this._entry.clutter_text.text);
			this._previewLabel.clutter_text.set_markup(result.markup);
			this._previewNotice!.visible = result.truncated;
		} else this._previewNotice!.hide();
		this._entry.visible = !preview;
		this._toolbar!.visible = !preview;
		this._preview.visible = preview;
		this._editButton!.checked = !preview;
		this._previewButton!.checked = preview;
		if (!preview) this._entry.clutter_text.grab_key_focus();
	}

	on_opened() {
		this._entry.clutter_text.grab_key_focus();
		this._entry.clutter_text.set_selection(-1, -1);
		this._entry.clutter_text.queue_relayout();
		this._entry.clutter_text.queue_redraw();
	}
}
