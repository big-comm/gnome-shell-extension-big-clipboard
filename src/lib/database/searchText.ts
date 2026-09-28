import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { ItemType } from '../common/constants.js';
import type { ClipboardEntry, LinkMetadata } from './database.js';

export function entrySearchText(entry: ClipboardEntry): readonly string[] {
	if (entry.type === ItemType.Image) return [];
	if (entry.type === ItemType.Link) {
		const metadata = entry.metadata as LinkMetadata | null;
		return [entry.content, metadata?.title ?? '', metadata?.description ?? ''];
	}
	if (entry.type === ItemType.File || entry.type === ItemType.Files) {
		const home = Gio.File.new_for_path(GLib.get_home_dir());
		return entry.content.split('\n').flatMap((uri) => {
			const file = Gio.File.new_for_uri(uri);
			const path = file.get_path() ?? uri;
			const relative = home.get_relative_path(file);
			return [uri, path, relative === null ? path : `~/${relative}`];
		});
	}
	return [entry.content];
}
