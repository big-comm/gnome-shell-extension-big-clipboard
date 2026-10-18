import assert from 'node:assert/strict';
import fs from 'node:fs';

// A Gda.DataModelIter and its data model keep each other alive, so Gda 6 never closes the SQLite file
// they read from: with iterators every disable()/enable() (each Big GNOME Center layout change) leaked a
// connection. Disposing results instead crashes the Shell (use after free), so results must be read with
// read_rows() and no iterator at all.
const source = fs.readFileSync('src/lib/database/gda.ts', 'utf8');
assert.ok(!/\.create_iter\(/.test(source), 'select results are read without Gda.DataModelIter');
assert.ok(!/\.run_dispose\(/.test(source), 'select results are never disposed explicitly');
const reads = source.match(/read_rows\(/g)?.length ?? 0;
assert.ok(reads >= 6, `every select reads through read_rows() (${reads})`);
console.log('Gda results: no iterators, no explicit dispose, read_rows for every select passed');
