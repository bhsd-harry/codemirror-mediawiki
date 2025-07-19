/* eslint-env node */

const config = require('@bhsd/code-standard/eslintrc.dist.cjs');

module.exports = {
	...config,
	parserOptions: {
		...config.parserOptions,
		sourceType: 'module',
	},
	rules: {
		...config.rules,
		'es-x/no-array-prototype-at': 0,
		'es-x/no-resizable-and-growable-arraybuffers': 0,
		'es-x/no-string-prototype-at': 0,
	},
};
