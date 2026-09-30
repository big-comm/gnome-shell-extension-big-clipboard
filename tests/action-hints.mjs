import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/ui/components/actionHint.ts', 'utf8');
const file = ts.createSourceFile('actionHint.ts', source, ts.ScriptTarget.Latest, true);
const fn = file.statements.find((n) => ts.isFunctionDeclaration(n));
const code = ts.transpileModule(fn.getText(file).replace('export ', ''), {}).outputText;
const pending = new Map();
const labels = [];
const signals = new Map();
let nextId = 0;
let interruptMeasurement = false;
const button = {
	mapped: true,
	hover: false,
	width: 28,
	connect: (name, callback) => signals.set(name, callback),
	has_key_focus: () => false,
	get_transformed_position: () => [80, 80],
};
const emit = (name) => signals.get(name)?.();
class Label {
	constructor() {
		this.visible = false;
		this.destroyed = false;
		labels.push(this);
	}
	get_preferred_width() {
		if (interruptMeasurement) {
			button.hover = false;
			emit('notify::hover');
		}
		assert.equal(this.destroyed, false, 'A measurement must not destroy its label');
		return [40, 40];
	}
	get_preferred_height() {
		assert.equal(this.destroyed, false);
		return [20, 20];
	}
	set_position() {
		assert.equal(this.destroyed, false);
	}
	show() {
		this.visible = true;
	}
	hide() {
		this.visible = false;
	}
	destroy() {
		this.destroyed = true;
	}
}
const actionHint = vm.runInNewContext(code + ';actionHint', {
	St: { Label },
	GLib: {
		PRIORITY_DEFAULT: 0,
		SOURCE_REMOVE: false,
		timeout_add: (_priority, _delay, callback) => {
			pending.set(++nextId, callback);
			return nextId;
		},
		source_remove: (id) => pending.delete(id),
	},
	Main: {
		layoutManager: {
			findMonitorForActor: () => ({ x: 0, y: 0, width: 800, height: 600 }),
			uiGroup: { add_child() {} },
		},
	},
});
function hover() {
	button.hover = true;
	emit('notify::hover');
}
function tick() {
	for (const [id, callback] of pending) {
		pending.delete(id);
		callback();
	}
}
actionHint(button, 'Color');
interruptMeasurement = true;
hover();
tick();
assert.equal(labels[0].visible, false);
interruptMeasurement = false;
hover();
tick();
assert.equal(labels.length, 1, 'Reuse the hint after hiding');
assert.equal(labels[0].visible, true);
emit('clicked');
assert.equal(labels[0].visible, false);
hover();
emit('destroy');
assert.equal(pending.size, 0);
assert.equal(labels[0].destroyed, true);
console.log('Action hints: reentrant hover, reuse, click dismissal and owner cleanup passed');
