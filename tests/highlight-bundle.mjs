import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

execFileSync('node', ['scripts/highlight/bundle.mjs'], {stdio: 'inherit'});
const {default: bundled} = await import('../dist/highlight.min.js');
assert.equal(bundled.versionString, '11.11.1');
assert.equal(bundled.listLanguages().length, 36);
const fresh = () => {
    const instance = bundled.newInstance();
    for (const id of bundled.listLanguages())
        instance.registerLanguage(id, bundled.getLanguage(id).rawDefinition);
    return instance;
};
const engine = fresh();
assert.match(engine.highlight('const answer = 42;', {language: 'javascript'}).value, /hljs-keyword/);
let checked = 0;
for (const file of fs.readdirSync('dist/languages')) {
    const {default: language} = await import(`../dist/languages/${file}`);
    assert.equal(typeof language, 'function', file);
    checked++;
}
assert.equal(checked, 192);
assert.equal(engine.getLanguage('ada'), undefined);
const {default: ada} = await import('../dist/languages/ada.min.js');
engine.registerLanguage('ada', ada);
assert.match(engine.highlight('procedure Hello is begin null; end Hello;', {language: 'ada'}).value, /hljs-keyword/);
engine.unregisterLanguage('ada');
assert.equal(engine.getLanguage('ada'), undefined);
engine.registerLanguage('ada', ada);
assert.equal(fresh().getLanguage('ada'), undefined, 'new activation does not retain disabled extra languages');
assert.ok(fs.readFileSync('dist/highlight-LICENSE', 'utf8').includes('Redistribution'));
console.log('Highlight bundle: 192 module hashes/imports, common/optional highlighting and isolated activation passed');
