import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const source = path.resolve('node_modules/@highlightjs/cdn-assets');
const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
if (metadata.version !== '11.11.1') throw new Error('Unexpected Highlight.js version');
const constants = fs.readFileSync('src/lib/common/constants.ts', 'utf8');
const coreHash = constants.match(/HljsSha512\s*=\s*'([a-f0-9]{128})'/)?.[1];
const modules = [...constants.matchAll(/\["([\w-]+)",\s*"[^"]+",\s*"([a-f0-9]{128})"\]/g)];
if (!coreHash || modules.length < 190) throw new Error('Incomplete Highlight.js checksum manifest');
const files = [['highlight.min.js', coreHash], ...modules.map(([, id, hash]) => [`languages/${id}.min.js`, hash])];
for (const [file, hash] of files) {
    const content = fs.readFileSync(path.join(source, 'es', file));
    if (createHash('sha512').update(content).digest('hex') !== hash)
        throw new Error(`Highlight.js integrity mismatch: ${file}`);
    const target = path.join('dist', file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, content);
}
fs.copyFileSync(path.join(source, 'LICENSE'), 'dist/highlight-LICENSE');
console.log(`Bundled Highlight.js ${metadata.version}: core + ${modules.length} verified modules`);
