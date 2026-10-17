import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/misc/clipboard.ts', 'utf8');
const fragment = source.slice(source.indexOf('const ReadChunkSize'), source.indexOf('function hasMoreGraphemes'));
// GLib hashes `length` UTF-8 bytes; -1 means the whole string.
const GLib = {
	ChecksumType: { MD5: 0 },
	PRIORITY_DEFAULT: 0,
	compute_checksum_for_string: (_type, s, length) => {
		const bytes = Buffer.from(s, 'utf8');
		return crypto
			.createHash('md5')
			.update(length < 0 ? bytes : bytes.subarray(0, length))
			.digest('hex');
	},
};
const { contentChecksum, readBounded } = vm.runInNewContext(
	ts.transpileModule(fragment, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText +
		';({ contentChecksum, readBounded })',
	{ GLib, ContentType: { Text: 0, Image: 1, File: 2 }, Uint8Array },
);

const text = (t) => contentChecksum({ type: 0, text: t });
assert.notEqual(text('ção A'), text('ção B'), 'accented texts that differ at the end are not duplicates');
assert.equal(text('ção A'), text('ção A'));
const files = (paths) => contentChecksum({ type: 2, paths, operation: 'copy' });
assert.notEqual(files(['file:///tmp/ação-1']), files(['file:///tmp/ação-2']));
assert.doesNotThrow(() => files(['file:///tmp/100%']), 'malformed URIs do not abort the capture');
assert.notEqual(files(['file:///tmp/100%']), files(['file:///tmp/100%25x']));

function stream(sizes) {
	let closed = false;
	let reads = 0;
	return {
		get closed() {
			return closed;
		},
		get reads() {
			return reads;
		},
		read_bytes_async: async () => {
			const n = sizes[reads++] ?? 0;
			return { toArray: () => new Uint8Array(n).fill(reads) };
		},
		close: () => {
			closed = true;
		},
	};
}
const small = stream([3, 2]);
const bytes = await readBounded(small, 10);
assert.deepEqual([...bytes], [1, 1, 1, 2, 2]);
assert.ok(small.closed);
const exact = await readBounded(stream([5, 5]), 10);
assert.equal(exact.length, 10, 'content at the limit is kept');
const big = stream([6, 6, 6, 6]);
assert.equal(await readBounded(big, 10), null, 'oversized content is ignored');
assert.equal(big.reads, 2, 'reading stops as soon as the limit is exceeded');
assert.ok(big.closed);
console.log('Clipboard capture: UTF-8 checksums, malformed URIs and size limit passed');
