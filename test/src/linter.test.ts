import * as assert from 'assert';
import {
	offsetAt,
	indexToPos,
	getPrefix,
	getCssLinter,
	getJsLinter,
	getWikiLinter,
	getLuaLinter,
} from '../../dist/linter.js';
import './linter.js';
import type {Diagnostic} from '@codemirror/lint';
import type {AST} from 'wikiparser-node';
import type {Range} from 'vscode-languageserver-types';

const wikitext = `<p style="top: 0;
left: 0;">`,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	css = `p#1{
top: 0; left: 0;
}`,
	range: [number, number] = [wikitext.indexOf('"') + 1, wikitext.lastIndexOf('"')];

const offsetTest = (lineOrOffset: number, column: number | undefined, offset: number): void => {
		assert.strictEqual(offsetAt(range, lineOrOffset, column), offset);
	},
	positionTest = (index: number, line: number, character: number): void => {
		assert.deepStrictEqual(indexToPos(wikitext, index), {line, character});
	},
	prefixTest = (type: string, tag = 'div'): void => {
		assert.strictEqual(getPrefix({type: `${type}-attr`, tag} as unknown as AST, 1), `${tag}#1{\n`);
	};

describe('Stylelint position transformation', () => {
	it('diagnostic offset', () => {
		offsetTest(-2, 4, 10);
		offsetTest(-1, 3, 13);
		offsetTest(0, 1, 26);
	});
	it('quickfix offset', () => {
		offsetTest(4, undefined, 14);
		offsetTest(17, undefined, 26);
		offsetTest(-1, undefined, 10);
	});
	it('quickfix position', () => {
		positionTest(14, 0, 14);
		positionTest(26, 1, 8);
		positionTest(10, 0, 10);
	});

	it('CSS block prefix', () => {
		prefixTest('ext');
		prefixTest('html', 'p');
		prefixTest('table', 'td');
	});
});

const getStylelintError = (
	line: number,
	character: number,
	to: number,
	endFix: number,
	wikilint?: boolean,
): Partial<Omit<Diagnostic, 'severity'>> & {severity: number, code: string, data: unknown[], range?: Range} => ({
	...wikilint
		? {from: character, to}
		: {
			range: {
				start: {line, character},
				end: {line, character: to},
			},
		},
	code: 'declaration-block-no-duplicate-properties',
	message: `Unexpected duplicate "top"${wikilint ? ' (declaration-block-no-duplicate-properties)' : ''}`,
	severity: 1,
	source: 'Stylelint',
	data: [
		{
			fix: true,
			title: `Fix: ${wikilint ? 'Stylelint' : 'declaration-block-no-duplicate-properties'}`,
			range: {
				start: {line, character},
				end: {line, character: endFix},
			},
			newText: '',
		},
	],
});

describe('linters', () => {
	it('Stylelint', async () => {
		assert.strictEqual(typeof stylelint, 'function');
		const lint = await getCssLinter();
		assert.deepStrictEqual(
			await lint('* { top: 0; top: 0 }'),
			[
				{
					line: 1,
					column: 5,
					endLine: 1,
					endColumn: 8,
					rule: 'declaration-block-no-duplicate-properties',
					url: undefined,
					severity: 'error',
					text: 'Unexpected duplicate "top" (declaration-block-no-duplicate-properties)',
					fix: {
						range: [10, 18],
						text: '',
					},
				},
			],
		);
		assert.deepStrictEqual(
			await lint('* { top: 0; top: 0 }', {'declaration-block-no-duplicate-properties': null}),
			[],
		);
		assert.strictEqual(
			await lint.fixer!('* { top: 0; top: 0 }', 'declaration-block-no-duplicate-properties'),
			'* { top: 0 }',
		);
	});
	it('ESLint', async () => {
		assert.strictEqual(typeof eslint, 'object');
		const lint = await getJsLinter();
		assert.deepStrictEqual(
			lint('console.log( !!!0 );'),
			[
				{
					line: 1,
					column: 15,
					endLine: 1,
					endColumn: 18,
					ruleId: 'no-extra-boolean-cast',
					messageId: 'unexpectedNegation',
					message: 'Redundant double negation.',
					severity: 2,
					nodeType: 'UnaryExpression',
					fix: {
						range: [14, 17],
						text: '0',
					},
				},
			],
		);
		assert.strictEqual(
			await lint.fixer!('console.log( !!!0 );', 'no-extra-boolean-cast'),
			'console.log( !0 );',
		);
		assert.deepStrictEqual(
			lint('console.log( !!!0 );', {
				extends: 'eslint:recommended',
				rules: {'no-extra-boolean-cast': 0},
			}),
			[],
		);
	});
	it('WikiLint', async () => {
		assert.strictEqual(typeof wikiparse, 'object');
		assert.strictEqual(typeof wikiparse.LanguageService, 'function');
		const lint = await getWikiLinter({}, {});
		assert.deepStrictEqual(
			await lint('</br><br style="top: 0; top: 0>'),
			[
				{
					range: {
						start: {line: 0, character: 0},
						end: {line: 0, character: 5},
					},
					code: 'unmatched-tag',
					message: 'tag that is both closing and self-closing',
					severity: 1,
					source: 'WikiLint',
					data: [
						{
							fix: true,
							title: 'Fix: open',
							range: {
								start: {line: 0, character: 1},
								end: {line: 0, character: 2},
							},
							newText: '',
						},
					],
				},
				{
					range: {
						start: {line: 0, character: 15},
						end: {line: 0, character: 30},
					},
					code: 'unclosed-quote',
					message: 'unclosed quotes',
					severity: 2,
					source: 'WikiLint',
					data: [
						{
							fix: false,
							title: 'Suggestion: close',
							range: {
								start: {line: 0, character: 30},
								end: {line: 0, character: 30},
							},
							newText: '"',
						},
					],
				},
				// from WikiParser-Node Stylelint integration
				getStylelintError(0, 16, 19, 23),
				// from `getWikiLinter()` Stylelint integration
				getStylelintError(0, 16, 19, 23, true),
			],
		);
		assert.deepStrictEqual(
			await lint('<br style="top: 0>', {defaultSeverity: 1}),
			[],
		);
		assert.deepStrictEqual(
			await lint('<br style="top: 0; top: 0">', {'invalid-css': '0'}),
			[
				// from WikiParser-Node Stylelint integration
				getStylelintError(0, 11, 14, 18),
			],
		);
		await lint('</br>');
		assert.strictEqual(
			await lint.fixer!('', 'unmatched-tag'),
			'<br>',
		);
	});
	it('Luacheck', async () => {
		assert.strictEqual(typeof luacheck, 'function');
		const lint = await getLuaLinter();
		assert.deepStrictEqual(
			await lint('f()'),
			[
				{
					line: 1,
					column: 1,
					end_column: 1,
					code: '113',
					msg: 'Accessing an undefined global variable',
					name: 'f',
					severity: 2,
				},
			],
		);
	});
});
