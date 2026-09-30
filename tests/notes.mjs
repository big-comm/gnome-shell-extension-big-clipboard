import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

async function load(path) {
	const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
	}).outputText;
	return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const { formatMarkdown: f, markdownPreview: p, PREVIEW_LIMIT } = await load('src/lib/ui/components/markdown.ts');
const { subjectNames, normalizeSubjects } = await load('src/lib/common/subjects.ts');
assert.deepEqual(f('Olá 🌍 texto', 4, 5, 'bold'), { text: 'Olá **🌍** texto', start: 6, end: 7 });
assert.deepEqual(f('Olá 🌍 texto', 5, 4, 'italic'), { text: 'Olá *🌍* texto', start: 5, end: 6 });
assert.deepEqual(f('abc', -1, -1, 'bold'), { text: 'abc****', start: 5, end: 5 });
assert.deepEqual(f('**abc**', 2, 5, 'bold'), { text: 'abc', start: 0, end: 3 });
assert.equal(f('**abc**', 0, -1, 'bold').text, 'abc');
assert.equal(f('a\nb\nc', 0, 4, 'bullet').text, '- a\n- b\nc');
assert.equal(f('- a\n- b', 0, -1, 'bullet').text, 'a\nb');
assert.equal(f('a\nb', 0, -1, 'number').text, '1. a\n2. b');
assert.equal(f('a\nb', 0, -1, 'quote').text, '> a\n> b');
assert.deepEqual(f('🌍', 0, 1, 'link'), { text: '[🌍](https://)', start: 4, end: 12 });
assert.equal(f('a', 0, 1, 'code').text, '`a`');
assert.equal(p('**Bold** *Italic* `code`').markup, '<b>Bold</b> <i>Italic</i> <tt>code</tt>');
assert.equal(p('<b>&"text</b>').markup, '&lt;b&gt;&amp;&quot;text&lt;/b&gt;');
assert.equal(p('[x](javascript:evil)').markup, '<u>x</u> (javascript:evil)');
assert.equal(
	p('- one\n> quote\n# title\n```js\n<b>\n```').markup,
	'• one\n<i>│ quote</i>\n<b>title</b>\n\n<tt>&lt;b&gt;</tt>\n',
);
assert.equal(p('🌍'.repeat(PREVIEW_LIMIT + 10)).truncated, true);
assert.equal([...p('🌍'.repeat(PREVIEW_LIMIT + 10)).markup].length, PREVIEW_LIMIT);
assert.equal(normalizeSubjects(' Work,  Work , work, Estudos, Cafe\u0301, Café, ,'), 'Work, Estudos, Café');
assert.deepEqual(subjectNames(''), []);
assert.equal(normalizeSubjects('Foo\nbar, 🧪'), 'Foo bar, 🧪');
console.log('Notes: Unicode selections, formatting toggles, safe bounded preview, subject normalization passed');

assert.equal(p(f('first\nsecond', 0, -1, 'bold').text).markup, '<b>first\nsecond</b>');

assert.equal(f('**abc**', 2, 5, 'italic').text, '***abc***');
assert.equal(f('***abc***', 3, 6, 'italic').text, '**abc**');
assert.equal(f('***abc***', 3, 6, 'bold').text, '*abc*');
assert.equal(f('**abc**', 0, -1, 'italic').text, '***abc***');
assert.equal(p('***abc***').markup, '<b><i>abc</i></b>');
assert.equal(p('**a *b***').markup, '<b>a <i>b</i></b>');
