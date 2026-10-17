import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/ui/searchEntry.ts', 'utf8');
const fragment = source.slice(source.indexOf('const SearchCollator'), source.indexOf('export const SearchChange'));
const { localeContains, collatorContains } = vm.runInNewContext(
	ts.transpileModule(fragment, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText +
		';({ localeContains, collatorContains })',
	{ Intl },
);

// Deterministic corpus mixing what users copy: Portuguese, decomposed accents, symbols and emoji.
let seed = 42;
const random = (n) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % n);
const pool = [
	...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
	...'áàâãäéêíóôõöúüçÁÀÂÃÉÊÍÓÔÕÚÇñÑ',
	'é', 'ã', 'ç',
	...'øØłŁßæÆđıİ',
	...' .,;:-_/\\()[]{}@#$%&*+=!?"\'',
	...'“”‘’–—…€',
	'🎉', '👍🏽', '中', '文', 'ﬁ', 'Ａ',
];
const pick = () => pool[random(pool.length)];
const make = (n) => Array.from({ length: n }, pick).join('');
const variants = (s) => [s, s.toUpperCase(), s.toLowerCase(), s.normalize('NFD'), s.normalize('NFD').replace(/\p{M}/gu, '')];

let regressions = 0;
let extra = 0;
for (let i = 0; i < 4000; i++) {
	const text = make(5 + random(40));
	const start = random(text.length);
	const sub = text.slice(start, start + 1 + random(4));
	for (const query of [...variants(sub), make(1 + random(3))]) {
		if (!query) continue;
		const before = collatorContains(text, query);
		const after = localeContains(text, query);
		if (before && !after) regressions++;
		if (!before && after) extra++;
	}
}
assert.equal(regressions, 0, 'every match of the collator search is still found');

// The collator compared fixed-length slices, so decomposed accents (macOS, PDFs) and ligatures never matched.
for (const [text, query] of [
	['ação'.normalize('NFD'), 'ação'],
	['ação'.normalize('NFD'), 'acao'],
	['ﬁm', 'fim'],
]) {
	assert.ok(!collatorContains(text, query) && localeContains(text, query), `now found: ${query}`);
}

// Matches users rely on.
for (const [text, query] of [
	['Configuração do GNOME', 'configuracao'],
	['Configuração do GNOME', 'AÇÃO'],
	['São Paulo', 'sao'],
	['Paguei R$ 10,00', 'r$ 10'],
	['“citação”', 'citacao'],
	['emoji 🎉 festa', '🎉'],
]) assert.ok(localeContains(text, query), `${query} in ${text}`);
assert.ok(!localeContains('Configuração', 'configuracoes'));

// Long entries no longer scan every offset with the collator.
const measure = (fn, text, query) => {
	const t0 = performance.now();
	fn(text, query);
	return performance.now() - t0;
};
const accented = 'ação pacote atualização GNOME extensão código '.repeat(20000);
const plain = 'install the package and restart the session '.repeat(20000);
const slow = measure(collatorContains, accented, 'configuracoes');
const fast = measure(localeContains, accented, 'configuracoes');
assert.ok(fast * 3 < slow, `folded search is faster (${fast.toFixed(1)} ms vs ${slow.toFixed(1)} ms)`);
const plainSlow = measure(collatorContains, plain, 'configuration');
const plainFast = measure(localeContains, plain, 'configuration');
assert.ok(plainFast * 20 < plainSlow, `ASCII text skips normalization (${plainFast.toFixed(1)} ms vs ${plainSlow.toFixed(1)} ms)`);
const long = accented;
console.log(
	`Search folding: 0 regressions in ${4000 * 6} queries, ${extra} decomposed-accent matches gained, accented ${slow.toFixed(0)} -> ${fast.toFixed(1)} ms, ASCII ${plainSlow.toFixed(0)} -> ${plainFast.toFixed(1)} ms on ${(long.length / 1e6).toFixed(1)} M chars passed`,
);
