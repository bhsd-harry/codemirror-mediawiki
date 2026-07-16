import {jsDoc, browser, extend} from '@bhsd/code-standard';

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
			'jsdoc/require-jsdoc': 0,
			'jsdoc/require-param-description': 0,
			'@stylistic/operator-linebreak': 0,
		},
	},
	{
		files: ['**/*.ts'],
		rules: {
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
		files: ['src/*.ts'],
		rules: {
			'arrow-body-style': 0,
			'jsdoc/no-bad-blocks': 0,
			'@stylistic/function-paren-newline': 0,
		},
	},
);
