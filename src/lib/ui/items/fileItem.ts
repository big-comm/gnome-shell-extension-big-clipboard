import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { registerClass } from '../../common/gjs.js';
import { globToRegex } from '../../common/glob.js';
import { Icon } from '../../common/icons.js';
import { FileItemSettings, FilePreviewType, FilePreviewVisibility } from '../../common/settings.js';
import { ClipboardEntry } from '../../database/database.js';
import { ContentInfo, createFileInfo } from '../components/contentInfo.js';
import {
	ContentPreview,
	FileType,
	ImagePreview,
	TextPreview,
	ThumbnailPreview,
	getFileType,
	tryCreateFilePreview,
} from '../components/contentPreview.js';
import { ClipboardItem } from './clipboardItem.js';

export function formatFile(file: Gio.File): string {
	const relative = Gio.File.new_for_path(GLib.get_home_dir()).get_relative_path(file);
	return relative !== null ? `~/${relative}` : file.get_parse_name();
}

export function fileIcon(file: Gio.File): Gio.Icon {
	const [type] = Gio.content_type_guess(file.get_basename(), null);
	return Gio.content_type_get_icon(type);
}

@registerClass()
export class FileItem extends ClipboardItem {
	private readonly fileItemSettings: FileItemSettings;

	private _filePreviewVisibility: FilePreviewVisibility = FilePreviewVisibility.Hidden;
	private _filePreviewTypes: FilePreviewType = FilePreviewType.All;
	private _filePreviewExclusionPatterns: string[] = [];
	private _filePreviewExclusionRegex: RegExp | null = null;

	private readonly _file: St.Label;
	private readonly _fileIcon: St.Icon;
	private readonly _fileName: St.Label;
	private readonly _fileSize: St.Label;
	private _identityLoaded = false;
	private _fileType?: FileType;
	private _thumbnail?: Gio.File | null;
	private _filePreview?: ContentPreview | null;
	private _fileInfo?: ContentInfo;
	private _previewIdleId: number = 0;

	private readonly _cancellable: Gio.Cancellable = new Gio.Cancellable();

	constructor(ext: CopyousExtension, entry: ClipboardEntry) {
		super(ext, entry, Icon.File, _('File'));

		this.fileItemSettings = this.ext.settings.get_child('file-item');

		this.add_style_class_name('file-item');
		const file = Gio.File.new_for_uri(entry.content);
		const identity = new St.BoxLayout({ style_class: 'file-identity', x_expand: true });
		this._fileIcon = new St.Icon({ gicon: fileIcon(file), icon_size: 40 });
		identity.add_child(this._fileIcon);
		const labels = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
		this._fileName = new St.Label({
			text: file.get_basename() ?? file.get_parse_name(),
			style_class: 'file-name',
			x_expand: true,
		});
		this._fileName.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
		this._fileSize = new St.Label({ style_class: 'file-size', visible: false });
		labels.add_child(this._fileName);
		labels.add_child(this._fileSize);
		identity.add_child(labels);
		this._content.add_child(identity);

		this._file = new St.Label({
			style_class: 'file-item-file',
			text: formatFile(Gio.File.new_for_uri(this.entry.content)),
			y_align: Clutter.ActorAlign.START,
			y_expand: true,
		});
		this._file.clutter_text.line_wrap = false;
		this._file.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
		this._content.add_child(this._file);

		// Bind properties
		this.fileItemSettings.connectObject('changed', this.updateFilePreview.bind(this), this);
		this.ext.settings.connectObject('changed::item-height', this.configureVisibility.bind(this), this);
		this.configureVisibility();
		const logger = this.ext.logger;
		this._previewIdleId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
			this._previewIdleId = 0;
			this.updateFilePreview().catch(logger.error.bind(logger));
			return GLib.SOURCE_REMOVE;
		});
	}

	protected override createSearchText(): readonly string[] {
		const file = this.entry.content.substring('file://'.length);
		return [file, this._file.text];
	}

	private async updateFilePreview() {
		if (!this._identityLoaded) {
			this._identityLoaded = true;
			const file = Gio.File.new_for_uri(this.entry.content);
			file.query_info_async(
				'standard::display-name,standard::icon,standard::size,standard::type',
				Gio.FileQueryInfoFlags.NONE,
				GLib.PRIORITY_LOW,
				this._cancellable,
				(_file, result) => {
					if (this._cancellable.is_cancelled()) return;
					try {
						const info = file.query_info_finish(result);
						this._fileName.text = info.get_display_name();
						this._fileIcon.gicon = info.get_icon() ?? this._fileIcon.gicon;
						this._fileSize.text =
							info.get_file_type() === Gio.FileType.DIRECTORY
								? _('Folder')
								: GLib.format_size(info.get_size());
						this._fileSize.show();
					} catch {
						/* Keep name and MIME icon for offline or missing files. */
					}
				},
			);
		}
		this._filePreviewVisibility = this.fileItemSettings.get_enum('file-preview-visibility');
		this._filePreviewTypes = this.fileItemSettings.get_flags('file-preview-types');
		this._filePreviewExclusionPatterns = this.fileItemSettings.get_strv('file-preview-exclusion-patterns');

		if (this._filePreviewExclusionPatterns.length > 0) {
			try {
				this._filePreviewExclusionRegex = new RegExp(globToRegex(...this._filePreviewExclusionPatterns));
			} catch {
				this._filePreviewExclusionRegex = null;
			}
		} else {
			this._filePreviewExclusionRegex = null;
		}

		await this.configureFilePreview();
		await this.configureFileInfo();
		this.configureVisibility();
	}

	private showFilePreview(): boolean {
		if (
			this._filePreviewVisibility === FilePreviewVisibility.Hidden ||
			this._filePreviewVisibility === FilePreviewVisibility.FileInfoOnly
		) {
			return false;
		}

		if (this._filePreview) {
			if (this._filePreview instanceof TextPreview) {
				if ((this._filePreviewTypes & FilePreviewType.Text) === 0) return false;
			} else if (this._filePreview instanceof ThumbnailPreview) {
				if ((this._filePreviewTypes & FilePreviewType.Thumbnail) === 0) return false;
			} else if (this._filePreview instanceof ImagePreview) {
				if ((this._filePreviewTypes & FilePreviewType.Image) === 0) return false;
			}
		} else if (this._fileType !== undefined) {
			if (this._fileType === FileType.Text) {
				if ((this._filePreviewTypes & FilePreviewType.Text) === 0) return false;
			} else if (this._fileType === FileType.Image) {
				if ((this._filePreviewTypes & FilePreviewType.Image) === 0) return false;
			} else if (this._thumbnail != null) {
				if ((this._filePreviewTypes & FilePreviewType.Thumbnail) === 0) return false;
			}
		}

		return !this._filePreviewExclusionRegex?.test(this.entry.content);
	}

	private async configureFilePreview() {
		if (this._filePreview == null && this.showFilePreview()) {
			const file = Gio.File.new_for_uri(this.entry.content);
			if (this._fileType === undefined || this._thumbnail === undefined) {
				[this._fileType, this._thumbnail] = await getFileType(file);
				if (this._cancellable.is_cancelled()) return;
			}

			const preview = await tryCreateFilePreview(this.ext, file, this._fileType, this._thumbnail);
			if (this._cancellable.is_cancelled()) {
				preview?.destroy();
				return;
			}
			this._filePreview = preview;
			if (this._filePreview) {
				this._content.insert_child_above(this._filePreview, this._file);
				this.configureVisibility();

				if (this._filePreview instanceof TextPreview) {
					this.ext.settings.connectObject('changed::tab-width', this.configureFilePreview.bind(this), this);
				} else if (this._filePreview instanceof ImagePreview) {
					// Hover effect
					this.bind_property('active', this._filePreview, 'active', GObject.BindingFlags.DEFAULT);
				}
			}
		} else if (this._filePreview !== null) {
			if (this._filePreview instanceof TextPreview) {
				this._filePreview.syntaxHighlighting = this.fileItemSettings.get_boolean('syntax-highlighting');
				this._filePreview.showLineNumbers = this.fileItemSettings.get_boolean('show-line-numbers');
				this._filePreview.tabWidth = this.ext.settings.get_int('tab-width');
			} else if (this._filePreview instanceof ImagePreview) {
				this._filePreview.backgroundSize = this.fileItemSettings.get_enum('background-size');
			}
		}
	}

	private async configureFileInfo() {
		if (
			this._fileInfo === undefined &&
			this._filePreviewVisibility !== FilePreviewVisibility.Hidden &&
			this._filePreviewVisibility !== FilePreviewVisibility.FilePreviewOnly
		) {
			const file = Gio.File.new_for_uri(this.entry.content);
			if (this._fileType === undefined || this._thumbnail === undefined) {
				[this._fileType, this._thumbnail] = await getFileType(file);
				if (this._cancellable.is_cancelled()) return;
			}

			const info = await createFileInfo(this.ext, file, this._fileType, this._cancellable);
			if (this._cancellable.is_cancelled()) {
				info.destroy();
				return;
			}
			this._fileInfo = info;
			this._content.add_child(this._fileInfo);
			this.configureVisibility();
		}
	}

	private configureVisibility() {
		// Compact cards prioritize the icon and filename.
		this._file.visible = this.ext.settings.get_int('item-height') >= 220;
		// File preview
		const showFilePreview = this.showFilePreview();
		if (this._filePreview && showFilePreview) {
			this._file.y_expand = false;
			this._file.clutter_text.line_wrap = false;
			this._file.clutter_text.ellipsize = Pango.EllipsizeMode.START;
			this._filePreview.visible = true;
		} else {
			this._file.y_expand = true;
			this._file.clutter_text.line_wrap = false;
			this._file.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
			if (this._filePreview) {
				this._filePreview.visible = false;
			}
		}

		// File info
		if (this._fileInfo != null) {
			if (
				this._fileType !== FileType.Unknown &&
				this._filePreviewVisibility !== FilePreviewVisibility.Hidden &&
				this._filePreviewVisibility !== FilePreviewVisibility.FilePreviewOnly
			) {
				this._fileInfo.visible = !(
					this._filePreview &&
					showFilePreview &&
					this._filePreviewVisibility === FilePreviewVisibility.FilePreviewOrFileInfo
				);
			} else {
				this._fileInfo.visible = false;
			}
		}
	}

	override destroy() {
		this.fileItemSettings.disconnectObject(this);
		if (this._previewIdleId) {
			GLib.source_remove(this._previewIdleId);
			this._previewIdleId = 0;
		}
		this._cancellable.cancel();

		super.destroy();
	}
}
