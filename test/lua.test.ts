import * as assert from 'assert';
import {CompletionContext} from '@codemirror/autocomplete';
import luaLanguage, {lua} from '../src/lua';
import {createState} from './util';
import type {CompletionResult, CompletionSource} from '@codemirror/autocomplete';

const mockTest = (doc: string, result: CompletionResult | null): void => {
	const state = createState(doc, luaLanguage()),
		context = new CompletionContext(state, doc.length, true),
		completion = (lua.languageData!['autocomplete'] as CompletionSource)(context) as CompletionResult | null;
	assert.deepStrictEqual(
		completion && {
			...completion,
			options: completion.options.filter(
				option => option.label.toLowerCase().startsWith(doc.slice(completion.from).toLowerCase()),
			),
		},
		result,
	);
};

describe('Lua autocompletion', () => {
	it('comment', () => {
		mockTest('-- a', null);
		mockTest('--[[\na', null);
	});
	it('string', () => {
		mockTest('"a', null);
		mockTest("'a", null);
		mockTest('[[a', null);
		mockTest('[=[a', null);
	});
	it('object access', () => {
		mockTest(
			'package.',
			{
				from: 8,
				options: [
					{label: 'loaded', type: 'interface'},
					{label: 'loaders', type: 'interface'},
					{label: 'preload', type: 'interface'},
					{label: 'seeall', type: 'function'},
				],
				validFor: /^\w*$/u,
			},
		);
		mockTest(
			'mw.site.stats.us',
			{
				from: 14,
				options: [
					{label: 'users', type: 'constant'},
					{label: 'usersInGroup', type: 'function'},
				],
				validFor: /^\w*$/u,
			},
		);
	});
	it('length operator', () => {
		mockTest(
			'#_',
			{
				from: 1,
				options: [{label: '_G', type: 'namespace'}],
				validFor: /^\w*$/u,
			},
		);
	});
	it('binary operator', () => {
		mockTest(
			'a + n',
			{
				from: 4,
				options: [{label: 'next', type: 'function'}],
				validFor: /^\w*$/u,
			},
		);
	});
	it('field name', () => {
		mockTest(
			'a[ n',
			{
				from: 3,
				options: [{label: 'next', type: 'function'}],
				validFor: /^\w*$/u,
			},
		);
	});
	it('table constructor', () => {
		mockTest(
			'{ f',
			{
				from: 2,
				options: [
					{label: 'false', type: 'constant'},
					{label: 'function', type: 'keyword'},
				],
				validFor: /^\w*$/u,
			},
		);
	});
	it('parentheses', () => {
		mockTest(
			'f( n',
			{
				from: 3,
				options: [
					{label: 'nil', type: 'constant'},
					{label: 'next', type: 'function'},
					{label: 'not', type: 'keyword'},
				],
				validFor: /^\w*$/u,
			},
		);
	});
	it('assignment', () => {
		mockTest(
			'a = n',
			{
				from: 4,
				options: [
					{label: 'nil', type: 'constant'},
					{label: 'next', type: 'function'},
					{label: 'not', type: 'keyword'},
				],
				validFor: /^\w*$/u,
			},
		);
		mockTest(
			'a, b = 0, n',
			{
				from: 10,
				options: [
					{label: 'nil', type: 'constant'},
					{label: 'next', type: 'function'},
					{label: 'not', type: 'keyword'},
				],
				validFor: /^\w*$/u,
			},
		);
	});
	it('closing bracket', () => {
		mockTest(
			'{0} o',
			{
				from: 4,
				options: [{label: 'or', type: 'keyword'}],
				validFor: /^\w*$/u,
			},
		);
		mockTest(
			'a[0] t',
			{
				from: 5,
				options: [{label: 'then', type: 'keyword'}],
				validFor: /^\w*$/u,
			},
		);
	});
	it('newline', () => {
		mockTest(
			'  f',
			{
				from: 2,
				options: [
					{label: 'for', type: 'keyword'},
					{label: 'false', type: 'constant'},
					{label: 'function', type: 'keyword'},
				],
				validFor: /^\w*$/u,
			},
		);
		mockTest(
			'f(); re',
			{
				from: 5,
				options: [
					{label: 'repeat', type: 'keyword'},
					{label: 'return', type: 'keyword'},
					{label: 'require', type: 'function'},
				],
				validFor: /^\w*$/u,
			},
		);
	});
	it('space', () => {
		mockTest(
			'a o',
			{
				from: 2,
				options: [{label: 'or', type: 'keyword'}],
				validFor: /^\w*$/u,
			},
		);
		mockTest(
			'a or n',
			{
				from: 5,
				options: [
					{label: 'nil', type: 'constant'},
					{label: 'next', type: 'function'},
					{label: 'not', type: 'keyword'},
				],
				validFor: /^\w*$/u,
			},
		);
	});
});
