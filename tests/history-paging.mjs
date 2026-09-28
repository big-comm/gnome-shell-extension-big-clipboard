import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/ui/clipboardDialog.ts', 'utf8');
const start = source.indexOf('export class ClipboardDialog');
const code = ts.transpileModule(source.slice(start).replace('export class', 'class'), {
	compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
let clock = 0,
	nextId = 0;
const callbacks = new Map();
const GLib = {
	PRIORITY_LOW: 300,
	PRIORITY_DEFAULT_IDLE: 200,
	SOURCE_REMOVE: false,
	get_monotonic_time: () => (clock += 1000),
	idle_add: (_p, cb) => {
		callbacks.set(++nextId, cb);
		return nextId;
	},
	source_remove: (id) => callbacks.delete(id),
};
const C = vm.runInNewContext(code + ';ClipboardDialog', {
	St: { Widget: class {} },
	Clutter: { Orientation: { HORIZONTAL: 0 } },
	GLib,
	global: { compositor: { enable_unredirect() {} } },
	BoxPointer: { PopupAnimation: { NONE: 0 } },
	INITIAL_LOAD_ITEMS: 12,
	LOAD_BATCH_ITEMS: 12,
	SearchChange: { Different: 1 },
	entrySearchText: (e) => [e.content],
});
const drain = () => {
	let n = 0;
	while (callbacks.size) {
		assert.ok(n++ < 10000, 'finite idle work');
		const [id, cb] = callbacks.entries().next().value;
		callbacks.delete(id);
		cb();
	}
};
class Entry {
	constructor(id) {
		this.id = id;
		this.content = `item ${id}`;
		this.datetime = { compare: (other) => id - other.id, id };
		this.handlers = new Map();
		this.next = 0;
	}
	connect(name, cb) {
		this.handlers.set(++this.next, { name, cb });
		return this.next;
	}
	disconnect(id) {
		this.handlers.delete(id);
	}
	emit(name) {
		for (const { name: n, cb } of [...this.handlers.values()]) if (n === name) cb();
	}
}
const query = (text) => ({
	withChange() {
		return this;
	},
	matchesEntry(_v, e) {
		return e.content.includes(text);
	},
});
const d = Object.create(C.prototype);
let rows = [],
	created = 0,
	destroyed = 0,
	selected = -1;
Object.assign(d, {
	_entries: new Map(),
	_entrySignals: new Map(),
	_pendingEntries: [],
	_pendingIndex: 0,
	_renderedCount: 0,
	_pageTarget: 12,
	_loadIdleId: 0,
	_refreshIdleId: 0,
	_loadToEnd: false,
	_open: true,
	_header: { searchEntry: { searchQuery: query('') } },
	_scrollView: {
		clearItems() {
			destroyed += rows.length;
			rows = [];
		},
		search() {},
		appendItems(batch) {
			rows.push(...batch);
		},
		selectItem(i) {
			selected = i;
		},
	},
	createItem(e) {
		created++;
		return { entry: e };
	},
});
const entries = Array.from({ length: 10000 }, (_, i) => new Entry(i));
d.loadEntries(entries);
drain();
assert.equal(rows.length, 12);
assert.equal(created, 12);
assert.equal(rows[0].entry.id, 9999);
d.requestMore();
drain();
assert.equal(rows.length, 24);
assert.equal(created, 24);
d.searchEntries(query('item 42'));
drain();
assert.equal(rows.length, 12);
assert.ok(rows.every((r) => r.entry.content.includes('item 42')));
d.searchEntries(query('item 1!'));
drain();
assert.equal(rows.length, 0);
d.searchEntries(query('item 1'));
drain();
assert.equal(rows.length, 12, 'search outside initial page');
d._loadToEnd = true;
d.requestMore();
drain();
assert.equal(rows.length, 1111);
assert.equal(selected, 1110);
d.searchEntries(query(''));
d.clearEntries();
drain();
assert.equal(rows.length, 0);
assert.equal(d._entries.size, 0);
assert.equal(callbacks.size, 0);
assert.ok(entries.every((e) => e.handlers.size === 0));
d.loadEntries(entries.slice(0, 100));
drain();
entries[99].emit('delete');
drain();
assert.equal(rows[0].entry.id, 98);
assert.equal(entries[99].handlers.size, 0);
const latest = new Entry(10001);
d.addEntry(latest);
drain();
assert.equal(rows[0].entry.id, 10001);
assert.equal(rows.length, 12);
// Closing can synchronously reset search from SearchEntry.vfunc_unmap().
d.hide = () => d.searchEntries(query(''));
d.finishClose();
assert.ok(rows.length < 12, 'time budget splits the first page');
drain();
assert.equal(rows.length, 12, 'unmap search must complete before reopening');
// Closing mid-page without a search reset must also retain a complete page.
d.hide = () => {};
d.searchEntries(query(''));
d.finishClose();
drain();
assert.equal(rows.length, 12);
// Cancel a partially started second page and retain only the first page.
d.requestMore();
d.finishClose();
drain();
assert.equal(rows.length, 12);
assert.equal(d._pageTarget, 12);
d.clearEntries();
assert.equal(destroyed, created, 'all rendered actors released');
console.log('History paging: 10000 entries, first 12, search, End, updates and cancellation passed');
