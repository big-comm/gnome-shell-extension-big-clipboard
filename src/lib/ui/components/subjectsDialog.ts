import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { registerClass } from '../../common/gjs.js';
import { normalizeSubjects, subjectNames } from '../../common/subjects.js';
import type { ClipboardEntry } from '../../database/database.js';
import { WrapLayout } from '../layout.js';

@registerClass()
export class SubjectEditor extends St.BoxLayout {
	readonly input: St.Entry;
	private readonly _chips: St.Widget;
	private readonly _suggestions: St.Widget;
	private _names: string[];

	constructor(
		value: string,
		private suggestions: string[] = [],
	) {
		super({ orientation: Clutter.Orientation.VERTICAL, style_class: 'subject-editor', x_expand: true });
		this._names = subjectNames(value);
		const row = new St.BoxLayout({ style_class: 'subject-input-row' });
		this.input = new St.Entry({
			hint_text: _('Add a subject'),
			accessible_name: _('Subjects'),
			can_focus: true,
			x_expand: true,
		});
		row.add_child(this.input);
		const add = new St.Button({ label: _('Add'), style_class: 'button', can_focus: true });
		add.connect('clicked', () => this.commitInput());
		row.add_child(add);
		this.add_child(row);
		this._chips = this.flow();
		const scroll = new St.ScrollView({
			style_class: 'subject-chips-scroll',
			hscrollbar_policy: St.PolicyType.NEVER,
			vscrollbar_policy: St.PolicyType.AUTOMATIC,
		});
		const box = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
		box.add_child(this._chips);
		scroll.child = box;
		this.add_child(scroll);
		this._suggestions = this.flow();
		this.add_child(this._suggestions);
		this.input.clutter_text.connect('key-press-event', (_actor, event: Clutter.Event) => {
			if ([Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_comma].includes(event.get_key_symbol())) {
				this.commitInput();
				return Clutter.EVENT_STOP;
			}
			return Clutter.EVENT_PROPAGATE;
		});
		this.input.clutter_text.connect('text-changed', () => this.updateSuggestions());
		this.render();
	}

	private flow() {
		return new St.Widget({
			x_expand: true,
			request_mode: Clutter.RequestMode.HEIGHT_FOR_WIDTH,
			layout_manager: new WrapLayout(),
		});
	}

	get text(): string {
		return normalizeSubjects([...this._names, this.input.text].join(','));
	}

	set text(value: string) {
		this._names = subjectNames(value);
		this.input.text = '';
		this.render();
	}

	private commitInput() {
		this._names = subjectNames(this.text);
		this.input.text = '';
		this.render();
		this.input.grab_key_focus();
	}

	private render() {
		this._chips.destroy_all_children();
		for (const name of this._names) {
			const label = new St.Label({ text: `${name}  ×` });
			label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
			const button = new St.Button({
				child: label,
				accessible_name: _('Remove subject: %s').format(name),
				style_class: 'button subject-chip',
				can_focus: true,
			});
			button.connect('clicked', () => {
				this._names = this._names.filter((value) => value !== name);
				this.render();
				this.input.grab_key_focus();
			});
			this._chips.add_child(button);
		}
		this.updateSuggestions();
	}

	private updateSuggestions() {
		this._suggestions.destroy_all_children();
		const selected = new Set(this._names.map((name) => name.toLocaleLowerCase()));
		const query = this.input.text.trim().toLocaleLowerCase();
		const matches = this.suggestions
			.filter((name) => !selected.has(name.toLocaleLowerCase()) && name.toLocaleLowerCase().includes(query))
			.slice(0, 4);
		for (const name of matches) {
			const label = new St.Label({ text: `+ ${name}` });
			label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
			const button = new St.Button({
				child: label,
				style_class: 'button subject-suggestion',
				can_focus: true,
			});
			button.connect('clicked', () => {
				this.input.text = name;
				this.commitInput();
			});
			this._suggestions.add_child(button);
		}
		this._suggestions.visible = matches.length > 0;
	}
}

export function subjectInput(value: string, suggestions: string[] = []): SubjectEditor {
	return new SubjectEditor(value, suggestions);
}

@registerClass()
export class SubjectsDialog extends ModalDialog.ModalDialog {
	constructor(entry: ClipboardEntry, suggestions: string[] = []) {
		super({ styleClass: 'clipboard-item-edit-dialog', destroyOnClose: true });
		const content = new Dialog.MessageDialogContent({
			title: _('Subjects'),
			description: _('Add subjects with Enter or commas. Search with # followed by a subject name.'),
		});
		this.contentLayout.add_child(content);
		const input = subjectInput(entry.subjects, suggestions);
		content.add_child(input);
		this.setInitialKeyFocus(input.input);
		this.addButton({ label: _('Cancel'), action: () => this.close(), key: Clutter.KEY_Escape });
		this.addButton({
			label: _('Save'),
			action: () => {
				entry.subjects = input.text;
				this.close();
			},
		});
	}
}
