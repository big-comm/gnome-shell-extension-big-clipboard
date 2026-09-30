import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const file = path => ({path, get_child: child => file(`${path}/${child}`)});
const exports = {};
const modules = {
    'gi://GLib': {get_user_data_dir: () => '/custom/data', get_user_config_dir: () => '/custom/config', get_user_cache_dir: () => '/custom/cache'},
    'gi://Gio': {file_new_build_filenamev: parts => file(parts.join('/'))},
    './settings.js': {DatabaseBackend: {Json: 'json', Sqlite: 'sqlite'}},
};
const code = ts.transpileModule(fs.readFileSync('src/lib/common/constants.ts', 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, esModuleInterop: true},
}).outputText;
vm.runInNewContext(code, {exports, require: id => {assert.ok(id in modules, id); return modules[id];}});
for (const uuid of ['copyous@boerdereinar.dev', 'big-clipboard@communitybig.org']) {
    const ext = {uuid};
    for (const [method, root] of [['getDataPath', 'data'], ['getConfigPath', 'config'], ['getCachePath', 'cache']])
        assert.equal(exports[method](ext).path, `/custom/${root}/copyous@boerdereinar.dev`);
    assert.equal(exports.getImagesPath(ext).path, '/custom/data/copyous@boerdereinar.dev/images');
    assert.equal(exports.getActionsConfigPath(ext).path, '/custom/config/copyous@boerdereinar.dev/actions.json');
    assert.equal(exports.getDefaultDatabaseFile(ext, 'sqlite').path, '/custom/data/copyous@boerdereinar.dev/clipboard.db');
    assert.equal(exports.getDefaultDatabaseFile(ext, 'json').path, '/custom/data/copyous@boerdereinar.dev/clipboard.json');
}
console.log('Storage identity: SQLite, JSON, images, actions and cache preserved across UUIDs');
