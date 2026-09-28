import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file, start, end, context, name) {
	const source = fs.readFileSync(file, 'utf8');
	const fragment = source
		.slice(source.indexOf(start), end ? source.indexOf(end) : undefined)
		.replace('export class', 'class');
	const code = ts.transpileModule(fragment, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
	return vm.runInNewContext(code + `;${name}`, context);
}
let queryCallback,
	infoCallback,
	constructed = 0;
class Cancellable {
	cancelled = false;
	cancel() {
		this.cancelled = true;
	}
	is_cancelled() {
		return this.cancelled;
	}
}
class Preview {
	constructor() {
		this.children = [];
	}
	connect(name, callback) {
		this.onDestroy = callback;
	}
	add_style_class_name() {}
	add_child(c) {
		this.children.push(c);
	}
	queue_relayout() {}
	destroy() {
		this.destroyed = true;
		this.onDestroy?.();
	}
}
const C = compile(
	'src/lib/ui/components/contentPreview.ts',
	'export class ImagePreview',
	'@registerClass()\nexport class ThumbnailPreview',
	{
		ContentPreview: Preview,
		Gio: { Cancellable, FileQueryInfoFlags: { NONE: 0 } },
		GLib: { PRIORITY_DEFAULT: 0 },
		BackgroundSize: { Cover: 0 },
		Clutter: { ActorAlign: { CENTER: 0 }, BrightnessContrastEffect: class {} },
		AsyncImageBox: class {
			constructor() {
				constructed++;
			}
			add_effect() {}
		},
		St: { Icon: class {} },
		loadIcon: () => null,
		Icon: { MissingImage: 0 },
		GdkPixbuf: {
			Pixbuf: {
				get_file_info_async(_p, _c, cb) {
					infoCallback = cb;
				},
				get_file_info_finish() {
					return [{}, 640, 480];
				},
			},
		},
	},
	'ImagePreview',
);
let queries = 0;
const file = {
	query_info_async(_a, _f, _p, _c, cb) {
		queries++;
		queryCallback = cb;
	},
	query_info_finish() {},
	get_path() {
		return '/tmp/fixture.png';
	},
};
const tick = () => new Promise((r) => setImmediate(r));
const a = new C({}, file, { width: 640, height: 480 }, false);
assert.equal(queries, 0, 'hidden preview performs no file I/O');
a.load();
a.load();
assert.equal(queries, 1, 'single request per card');
a.destroy();
queryCallback(file, {});
await tick();
assert.equal(constructed, 0, 'no actors after destruction');
const b = new C({}, file, null, false);
b.load();
queryCallback(file, {});
await tick();
assert.equal(constructed, 0);
infoCallback(null, {});
await tick();
assert.equal(constructed, 1);
b.destroy();
const c = new C({}, file, null, false);
c.load();
queryCallback(file, {});
await tick();
c.destroy();
infoCallback(null, {});
await tick();
assert.equal(constructed, 1, 'cancelled dimension request cannot resurrect card');
const d = new C({}, file, { width: 640, height: 480 }, false);
d.load();
queryCallback(
	{
		query_info_finish() {
			throw Error('missing');
		},
	},
	{},
);
await tick();
assert.equal(d.children.length, 1, 'missing image placeholder');
d.destroy();

let acquired,
	unowned = [],
	exported = 0,
	subscribed = 0,
	unsubscribed = 0;
const bus = {
	signal_subscribe() {
		return ++subscribed;
	},
	signal_unsubscribe() {
		unsubscribed++;
	},
};
const D = compile(
	'src/lib/common/dbus.ts',
	'export class DbusService',
	null,
	{
		GObject: { Object: class {} },
		DBusInterfaceXml: '',
		Gio: {
			DBus: {
				session: bus,
				system: bus,
				own_name(_b, _n, _f, cb) {
					acquired = cb;
					return 42;
				},
				unown_name(id) {
					unowned.push(id);
				},
			},
			BusType: { SESSION: 0 },
			BusNameOwnerFlags: { NONE: 0 },
			DBusSignalFlags: { NONE: 0 },
			DBusExportedObject: {
				wrapJSObject() {
					return {
						export() {
							exported++;
						},
						unexport() {
							exported--;
						},
					};
				},
			},
		},
	},
	'DbusService',
);
const service = new D();
service.destroy();
acquired({}, 'test');
assert.deepEqual(unowned, [42]);
assert.equal(exported, 0);
assert.equal(unsubscribed, subscribed);
const next = new D();
acquired({}, 'test');
assert.equal(exported, 1);
next.destroy();
assert.equal(exported, 0);
console.log('Preview lifecycle: deferred I/O, cancellation, missing images and D-Bus teardown passed');
