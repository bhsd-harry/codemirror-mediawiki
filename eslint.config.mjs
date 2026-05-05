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
			'no-param-reassign': 0,
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
			'no-unused-labels': 0,
			'jsdoc/require-jsdoc': 0,
			'jsdoc/require-param-description': 0,
			'unicorn/prefer-regexp-test': 0,
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
			camelcase: [
				2,
				{
					allow: ['end_column'],
				},
			],
			'@typescript-eslint/class-methods-use-this': [
				2,
				{
					ignoreOverrideMethods: true,
					ignoreClassesThatImplementAnInterface: 'public-fields',
				},
			],
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
			'arrow-body-style': 0,
			'jsdoc/no-bad-blocks': 0,
		},
		settings: {
			jsdoc: {
				structuredTags: {
					test: {
						name: false,
						type: false,
					},
				},
			},
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
		},
	},
	{
		files: ['test/src/*.ts'],
		rules: {
			'@typescript-eslint/strict-void-return': 0,
		},
	},
);
