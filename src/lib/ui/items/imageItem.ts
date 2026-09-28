import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { ImageItemSettings } from '../../common/settings.js';
import { ClipboardEntry, ImageMetadata } from '../../database/database.js';
import { ContentInfo, createFileInfo } from '../components/contentInfo.js';
import { FileType, ImagePreview } from '../components/contentPreview.js';
import { ClipboardItem } from './clipboardItem.js';

@registerClass({
	Properties: {
		'show-image-info': GObject.ParamSpec.boolean(
			'show-image-info',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			false,
		),
	},
})
export class ImageItem extends ClipboardItem {
	private readonly imageItemSettings: ImageItemSettings;

	private _showImageInfo: boolean = false;

	private readonly _imagePreview: ImagePreview;
	private _imageInfo?: ContentInfo;

	private readonly _cancellable: Gio.Cancellable = new Gio.Cancellable();

	constructor(ext: CopyousExtension, entry: ClipboardEntry, loadPreview: boolean = true) {
		super(ext, entry, Icon.Image, _('Image'));

		this.imageItemSettings = this.ext.settings.get_child('image-item');

		this.add_style_class_name('image-item');
		this.add_style_class_name('no-image-info');

		const file = Gio.File.new_for_uri(entry.content);
		const metadata = entry.metadata as Partial<ImageMetadata> | null;
		const dimensions =
			metadata &&
			typeof metadata.width === 'number' &&
			metadata.width > 0 &&
			typeof metadata.height === 'number' &&
			metadata.height > 0
				? { width: metadata.width, height: metadata.height }
				: null;
		this._imagePreview = new ImagePreview(ext, file, dimensions, loadPreview);
		this._content.add_child(this._imagePreview);

		// Bind properties
		this.imageItemSettings.connectObject(
			'changed::show-image-info',
			this.updateSettings.bind(this),
			'changed::background-size',
			this.updateSettings.bind(this),
			this,
		);

		this.updateSettings();

		// Hover effect
		this.bind_property('active', this._imagePreview, 'active', GObject.BindingFlags.DEFAULT);
	}

	get showImageInfo() {
		return this._showImageInfo;
	}

	set showImageInfo(showImageInfo: boolean) {
		if (this._showImageInfo === showImageInfo) return;

		this._showImageInfo = showImageInfo;
		this.notify('show-image-info');
		this.configureImageInfo();
	}

	protected override createSearchText(): readonly string[] {
		return [];
	}

	public override loadPreview(): void {
		this._imagePreview.load();
		this._imagePreview.active = this.active;
	}

	private updateSettings() {
		this.showImageInfo = this.imageItemSettings.get_boolean('show-image-info');
		this._imagePreview.backgroundSize = this.imageItemSettings.get_enum('background-size');
	}

	private configureImageInfo() {
		if (this._imageInfo === undefined && this.showImageInfo) {
			const metadata = this.entry.metadata as Partial<ImageMetadata> | null;
			const dimensions =
				metadata &&
				typeof metadata.width === 'number' &&
				metadata.width > 0 &&
				typeof metadata.height === 'number' &&
				metadata.height > 0
					? { width: metadata.width, height: metadata.height }
					: null;
			createFileInfo(
				this.ext,
				Gio.File.new_for_uri(this.entry.content),
				FileType.Image,
				this._cancellable,
				dimensions,
			)
				.then((imageInfo) => {
					this._imageInfo = imageInfo;
					this._content.add_child(this._imageInfo);
					this.configureImageInfo();
				})
				.catch(() => {});
		}

		if (this._imageInfo == null) {
			return;
		}

		this._imageInfo.visible = this.showImageInfo;
		if (this.showImageInfo) {
			this.remove_style_class_name('no-image-info');
		} else {
			this.add_style_class_name('no-image-info');
		}
	}

	override destroy() {
		this.imageItemSettings.disconnectObject(this);
		this._cancellable.cancel();

		super.destroy();
	}
}
