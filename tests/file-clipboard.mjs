import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path, start, name, context) {
	const source = fs.readFileSync(path, 'utf8').slice(fs.readFileSync(path, 'utf8').indexOf(start));
	const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
	return vm.runInNewContext(code.replaceAll('export ', '') + `;${name}`, context);
}
const source = fs.readFileSync('src/lib/misc/clipboard.ts', 'utf8');
const method = source.slice(source.indexOf('public copyContent('), source.indexOf('public pasteContent('));
const code = ts.transpileModule(`class Manager { ${method} }`, {
	compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const ContentType = { Text: 0, Image: 1, File: 2 };
const Manager = vm.runInNewContext(code + ';Manager', {
	ContentType,
	contentChecksum: () => 'checksum',
	Utf8Encoder: new TextEncoder(),
	St: { ClipboardType: { CLIPBOARD: 1, PRIMARY: 0 } },
});
const manager = new Manager();
const writes = [];
manager.clipboard = { set_content: (...args) => writes.push(args), set_text: (...args) => writes.push(args) };
manager.ext = { settings: { get_boolean: () => false } };
const uris = ['file:///tmp/Relat%C3%B3rio%20%231.pdf', 'file:///tmp/second.pdf'];
for (const paths of [uris.slice(0, 1), uris, uris]) {
	manager.copyContent({ type: ContentType.File, paths, operation: 'cut' });
	const [selection, mime, data] = writes.at(-1);
	assert.equal(selection, 1);
	assert.equal(mime, 'text/uri-list');
	assert.equal(new TextDecoder().decode(data), paths.join('\r\n') + '\r\n');
}
manager.copyContent({ type: ContentType.Text, text: 'plain text' });
assert.deepEqual(writes.at(-1), [1, 'plain text']);
const png = new Uint8Array([1, 2, 3]);
manager.copyContent({ type: ContentType.Image, mimetype: 'image/png', data: png });
assert.deepEqual(writes.at(-1), [1, 'image/png', png]);
const thumbnail = { path: '/cache/preview.png' };
const preview = compile(
	'src/lib/ui/components/contentPreview.ts',
	'export async function tryCreateFilePreview',
	'tryCreateFilePreview',
	{
		FileType: { Text: 0, Image: 1 },
		FilePreviewType: { Text: 1, Image: 2, Thumbnail: 4 },
		ThumbnailPreview: class {
			constructor(_ext, file) {
				this.file = file;
			}
		},
	},
);
const ext = {
	settings: { get_child: () => ({ get_flags: () => 4 }) },
	logger: {
		error: (e) => {
			throw e;
		},
	},
};
const pdf = { query_exists: () => true };
assert.equal((await preview(ext, pdf, 99, thumbnail)).file, thumbnail);
assert.equal(await preview(ext, pdf, 99, null), null, 'PDF without thumbnail keeps file identity');
console.log(
	'File clipboard: standard URI lists, encoded names, multiple files, text/image regression and PDF thumbnail passed',
);
