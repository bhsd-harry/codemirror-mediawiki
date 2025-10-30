import {jsDoc, browser, extend} from '@bhsd/code-standard';
import globals from 'globals';

export default extend(
	jsDoc,
	browser,
	{
		ignores: ['*-page.js'],
	},
	{
		rules: {
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
	},
	{
		files: ['**/*.json'],
		rules: {
			'no-irregular-whitespace': 0,
		},
	},
	{
		files: ['**/*.ts'],
		rules: {
			'@typescript-eslint/no-shadow': [
				2,
				{
					builtinGlobals: false,
				},
			],
		},
	},
	{
		files: ['*.cjs'],
		languageOptions: {
			globals: globals.node,
		},
	},
	{
		files: ['src/*.ts'],
		rules: {
			'jsdoc/no-bad-blocks': 0,
		},
	},
	{
		files: ['mw/*.ts'],
		languageOptions: {
			globals: {
				...globals.jquery,
				mw: 'readonly',
				OO: 'readonly',
			},
			parserOptions: {
				project: './mw/tsconfig.json',
			},
		},
	},
	{
		files: ['test/*.ts'],
		languageOptions: {
			parserOptions: {
				project: './test/tsconfig.json',
			},
		},
	},
	{
		files: ['bundle/*.ts'],
		languageOptions: {
			parserOptions: {
				project: './bundle/tsconfig.json',
			},
		},
	},
);
