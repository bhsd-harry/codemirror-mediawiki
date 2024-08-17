/* eslint-env node */

const config = require('@bhsd/common/eslintrc.browser.cjs');
const {overrides: [json, ts]} = config;

module.exports = {
	...config,
	parserOptions: {
		...config.parserOptions,
		sourceType: 'module',
	},
	ignorePatterns: [
		...config.ignorePatterns,
		'*-page.js',
	],
	rules: {
		...config.rules,
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
