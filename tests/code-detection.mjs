import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import hljs from '@highlightjs/cdn-assets/es/highlight.min.js';
const source = ts.transpileModule(fs.readFileSync('src/lib/common/codeDetection.ts', 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022},
}).outputText;
const {detectCodeLanguage: detect} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const shell = '#!/bin/bash\n\necho "Isso é apenas um teste"\nif [ a="b" ]; the\n  echo "$b"';
for (const engine of [undefined, null, hljs]) {
    assert.equal(detect(shell, engine).id, 'bash', 'incomplete shell with explicit interpreter');
    assert.equal(detect('#!/usr/bin/env -S python3 -u\nprint("Olá")', engine).id, 'python');
    assert.equal(detect('#!/usr/bin/env node\nconsole.log("Hello")', engine).id, 'javascript');
}
assert.equal(detect('const greeting = "Hello, GNOME";\nconsole.log(greeting);', hljs).id, 'javascript');
for (const note of ['', 'Just a plain note', '**Apenas um texto de teste**', '# Heading\n- first\n- second', String.raw`C:\Users\notes`])
    assert.equal(detect(note, hljs), null, note);
assert.equal(detect('echo \"Hello\"', hljs).id, 'bash');
assert.equal(detect('sudo dnf update', hljs).id, 'bash');
for (const text of [
    'Release checklist\n\nReview the interface\nTest on GNOME 50 and 51\nPublish the package',
    '**Release checklist**\n\n- Review the interface\n- Test on GNOME 50 and 51\n- Publish the package',
]) assert.equal(detect(text, hljs), null, 'ordinary notes must not become Kotlin code');
let sample;
detect('x='.repeat(50000), {highlightAuto(text) {sample = text; return {relevance: 0};}});
assert.equal(sample.length, 10000, 'bounded detection');
console.log('Code detection: shebang priority, incomplete shell, startup fallback, JavaScript, prose and bounded input passed');
