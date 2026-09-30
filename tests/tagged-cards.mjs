import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import postcss from 'postcss';
import * as sass from 'sass';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/ui/items/clipboardItem.ts', 'utf8');
const file = ts.createSourceFile('clipboardItem.ts', source, ts.ScriptTarget.Latest, true);
const cls = file.statements.find((n) => ts.isClassDeclaration(n) && n.name.text === 'ClipboardItem');
const method = cls.members.find((n) => n.name?.getText(file) === 'updateTag');
const tags = ['blue', 'teal', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'slate'];
const code = ts.transpileModule(`class Test { ${method.getText(file)} }`, {}).outputText;
const Test = vm.runInNewContext(`${code}; Test`, { Tags: tags });
const item = new Test();
item.entry = { tag: 'blue' };
const classes = new Set(['clipboard-item', 'text-item']);
item.add_style_class_name = (name) => classes.add(name);
item.remove_style_class_name = (name) => classes.delete(name);
for (const tag of [...tags, 'untrusted-class', null, 'teal']) {
	item.entry.tag = tag;
	item.updateTag();
	item.updateTag();
	assert.deepEqual([...classes], ['clipboard-item', 'text-item', ...(tags.includes(tag) ? [`tag-${tag}`] : [])]);
}

function rgb(value) {
	if (value.startsWith('#')) {
		let hex = value.slice(1);
		if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
		return hex.match(/../g).map((v) => parseInt(v, 16) / 255);
	}
	assert.ok(value.startsWith('rgb('), `Opaque RGB expected: ${value}`);
	return value
		.match(/[\d.]+/g)
		.map(Number)
		.map((c) => c / 255);
}
function luminance(c) {
	return rgb(c)
		.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
		.reduce((v, c, i) => v + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
	const x = luminance(a),
		y = luminance(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
for (const theme of ['default', 'yaru']) {
	for (const variant of ['dark', 'light', 'high-contrast']) {
		const css = postcss.parse(
			sass.compile(`resources/css/themes/${theme}/${variant}.scss`, {
				loadPaths: ['resources/css/themes/default', `resources/css/themes/${theme}/gnome-shell-sass`],
				logger: sass.Logger.silent,
			}).css,
		);
		const style = (selector) => {
			const declarations = {};
			css.walkRules((rule) => {
				if (rule.selectors.includes(selector)) rule.walkDecls((d) => (declarations[d.prop] = d.value));
			});
			return declarations;
		};
		for (const tag of tags) {
			const root = `.clipboard-item.tag-${tag}`;
			const normal = style(root);
			const secondary = style(`${root} .clipboard-item-header .event-time`).color;
			for (const state of ['', ':hover', ':active', ':hover:active']) {
				const bg = style(root + state)['background-color'];
				assert.ok(contrast(normal.color, bg) >= 4.5, `${theme}/${variant}/${tag}/${state}: text`);
				assert.ok(contrast(secondary, bg) >= 4.5, `${theme}/${variant}/${tag}/${state}: metadata`);
			}
			const pin = style(
				`${root} .clipboard-item-header .clipboard-item-header-buttons .clipboard-item-header-button:checked`,
			);
			assert.ok(contrast(pin.color, pin['background-color']) >= 4.5, `${tag}: pin`);
		}
	}
}
console.log('Tagged cards: live class replacement, 9 colors × 6 themes × 4 states, opaque fills and contrast passed');
