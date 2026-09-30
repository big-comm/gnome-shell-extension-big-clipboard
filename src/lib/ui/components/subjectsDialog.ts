import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { registerClass } from '../../common/gjs.js';
import { normalizeSubjects } from '../../common/subjects.js';
import type { ClipboardEntry } from '../../database/database.js';

export function subjectInput(value: string): St.Entry {
	return new St.Entry({
		text: value,
		hint_text: _('Subjects, separated by commas'),
		accessible_name: _('Subjects'),
		can_focus: true,
		x_expand: true,
	});
}

@registerClass()
export class SubjectsDialog extends ModalDialog.ModalDialog {
	constructor(entry: ClipboardEntry) {
		super({ styleClass: 'clipboard-item-edit-dialog', destroyOnClose: true });
		const content = new Dialog.MessageDialogContent({
			title: _('Subjects'),
			description: _('Separate subjects with commas. Search with # followed by a subject name.'),
		});
		this.contentLayout.add_child(content);
		const input = subjectInput(entry.subjects);
		content.add_child(input);
		this.setInitialKeyFocus(input);
		this.addButton({ label: _('Cancel'), action: () => this.close(), key: Clutter.KEY_Escape });
		this.addButton({
			label: _('Save'),
			action: () => {
				entry.subjects = normalizeSubjects(input.text);
				this.close();
			},
		});
	}
}
