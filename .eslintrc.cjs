/* eslint-env node */

const config = require('@bhsd/code-standard/eslintrc.browser.cjs');
const {parserOptions, ignorePatterns, rules, overrides: [json, ts]} = config;

module.exports = {
	...config,
	parserOptions: {
		...parserOptions,
		sourceType: 'module',
	},
	ignorePatterns: [
		...ignorePatterns,
		'*-page.js',
	],
	rules: {
		...rules,
		'no-await-in-loop': 2,
		'no-restricted-globals': [
			2,
			'history',
			'name',
			'origin',
			'parent',
			'Range',
			'Text',
		],
		'no-shadow': [
			2,
			{
				builtinGlobals: false,
			},
		],
		'@stylistic/max-len': [
			2,
			{
				ignoreRegExpLiterals: true,
				code: 120,
			},
		],
		'jsdoc/require-jsdoc': 0,
		'jsdoc/require-param-description': 0,
	},
	overrides: [
		{
			...json,
			rules: {
				...json.rules,
				'no-irregular-whitespace': 0,
			},
		},
		{
			...ts,
			rules: {
				...ts.rules,
				'@typescript-eslint/no-shadow': [
					2,
					{
						builtinGlobals: false,
					},
				],
			},
		},
		{
			files: 'src/*.ts',
			rules: {
				'jsdoc/no-bad-blocks': 0,
			},
		},
		{
			files: 'mw/*.ts',
			env: {
				jquery: true,
			},
			globals: {
				mw: 'readonly',
				OO: 'readonly',
			},
			parserOptions: {
				project: './mw/tsconfig.json',
			},
		},
		{
			files: 'test/*.ts',
			parserOptions: {
				project: './test/tsconfig.json',
			},
		},
	],
};
