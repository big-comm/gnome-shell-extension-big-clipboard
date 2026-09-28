/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config | import('@trivago/prettier-plugin-sort-imports').PluginConfig}
 */
const config = {
	plugins: ['@trivago/prettier-plugin-sort-imports'],
	semi: true,
	trailingComma: 'all',
	singleQuote: true,
	printWidth: 120,
	quoteProps: 'consistent',
	importOrder: ['^gi://|^cairo', '^resource://', '^[^./]', '^[./]'],
	importOrderSeparation: true,
	importOrderSortSpecifiers: true,
	importOrderParserPlugins: ['typescript', 'decorators'],
};

export default config;
