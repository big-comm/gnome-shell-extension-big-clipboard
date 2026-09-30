import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { detectCodeLanguage } from '../../common/codeDetection.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { CodeItemSettings, TextItemSettings } from '../../common/settings.js';
import { ClipboardEntry } from '../../database/database.js';
import { CodeLabel } from '../components/codeLabel.js';
import { TextInfo } from '../components/contentInfo.js';
import { normalizeIndentation, trim } from '../components/label.js';
import { markdownPreview } from '../components/markdown.js';
import { ClipboardItem } from './clipboardItem.js';

@registerClass()
export class TextItem extends ClipboardItem {
	private readonly textItemSettings: TextItemSettings;

	private readonly _text: St.Label;
	private readonly codeItemSettings: CodeItemSettings;
	private _code: CodeLabel | undefined;
	private _disconnectHljs?: () => void;
	private _textInfo?: TextInfo;

	constructor(ext: CopyousExtension, entry: ClipboardEntry) {
		super(ext, entry, Icon.Text, _('Text'));

		this.textItemSettings = this.ext.settings.get_child('text-item');
		this.codeItemSettings = this.ext.settings.get_child('code-item');

		this.add_style_class_name('text-item');

		this._text = new St.Label({
			style_class: 'text-item-content',
			y_align: Clutter.ActorAlign.FILL,
			y_expand: true,
			min_height: 0,
		});
		this._text.clutter_text.line_wrap = true;
		this._text.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
		this._content.add_child(this._text);

		this.textItemSettings.connectObject('changed', this.updateTextInfo.bind(this), this);
		this.ext.settings.connectObject('changed::tab-width', this.updateText.bind(this), this._text);

		entry.connectObject('notify::content', this.updateText.bind(this), this);
		this.codeItemSettings.connectObject('changed', this.updateText.bind(this), this);
		this._disconnectHljs = this.ext.connectHljsInit(this.updateText.bind(this));
		entry.connectObject('notify::content', this.updateTextInfo.bind(this), this);

		this.updateText();
		this.updateTextInfo();
	}

	private updateText() {
		const tabWidth = this.ext.settings.get_int('tab-width');
		const language = detectCodeLanguage(this.entry.content, this.ext.hljs);
		this._text.visible = !language;
		if (language) {
			this.add_style_class_name('code-item');
			if (!this._code) {
				this._code = new CodeLabel(this.ext, {
					style_class: 'code-item-content',
					y_align: Clutter.ActorAlign.FILL,
					y_expand: true,
				});
				this._content.insert_child_at_index(this._code, 0);
			}
			this._code.language = language;
			this._code.tabWidth = tabWidth;
			this._code.syntaxHighlighting = this.codeItemSettings.get_boolean('syntax-highlighting');
			this._code.showLineNumbers = this.codeItemSettings.get_boolean('show-line-numbers');
			this._code.code = this.entry.content;
		} else {
			this.remove_style_class_name('code-item');
			this._code?.destroy();
			this._code = undefined;
			const text = normalizeIndentation(trim(this.entry.content.slice(0, 4096)), tabWidth);
			this._text.clutter_text.set_markup(markdownPreview(text).markup);
		}
	}

	private updateTextInfo() {
		const show = this.textItemSettings.get_boolean('show-text-info');
		const textCountMode = this.textItemSettings.get_enum('text-count-mode');

		if (this._textInfo) {
			this._textInfo.visible = show;
			this._textInfo.text = this.entry.content;
			this._textInfo.textCountMode = textCountMode;
		} else if (show) {
			this._textInfo = new TextInfo(this.entry.content, textCountMode);
			this._content.add_child(this._textInfo);
		}
	}

	override destroy() {
		this._disconnectHljs?.();
		this.codeItemSettings.disconnectObject(this);
		this.textItemSettings.disconnectObject(this);
		this.ext.settings.disconnectObject(this._text);
		this.entry.disconnectObject(this);

		super.destroy();
	}
}
