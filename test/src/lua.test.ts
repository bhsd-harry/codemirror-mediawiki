import * as assert from 'assert';
import {foldable, syntaxTree} from '@codemirror/language';
import lua, {markDocTag} from '../../dist/lua.js';
import {autocompletionTest, createState, convertFullRangeSet, filterFromRangeSet} from './util.js';
import type {CompletionSource} from '@codemirror/autocomplete';

const nil = [
		{label: 'nil', type: 'constant'},
		{label: 'next', type: 'function'},
		{label: 'not', type: 'keyword'},
	],
	lang = lua(),
	[source] = createState('', lang).languageDataAt<CompletionSource>('autocomplete', 0);

const mockTest = autocompletionTest(source!, lang, /^\w*$/u);

const foldTest = (doc: string, result: unknown): void => {
	assert.deepStrictEqual(
		foldable(createState(doc, lang), 0, doc.indexOf('\n')),
		result,
	);
};

const markTest = (doc: string, tag: [number, number][], type: [number, number][]): void => {
	const state = createState(doc, lang),
		{length} = state.doc,
		set = markDocTag(syntaxTree(state), [{from: 0, to: length}], state),
		arr = convertFullRangeSet(set, length);
	assert.deepStrictEqual(filterFromRangeSet(arr, 'cm-doctag'), tag);
	assert.deepStrictEqual(filterFromRangeSet(arr, 'cm-doctag-type'), type);
};

describe('Lua autocompletion', () => {
	it('comment', async () => {
		await mockTest('-- a', null);
		await mockTest('--[[\na', null);
	});
	it('string', async () => {
		await mockTest('"a', null);
		await mockTest("'a", null);
		await mockTest('[[a', null);
		await mockTest('[=[a', null);
	});
	it('object access', async () => {
		await mockTest(
			'package.',
			{
				from: 8,
				options: [
					{label: 'loaded', type: 'interface'},
					{label: 'loaders', type: 'interface'},
					{label: 'preload', type: 'interface'},
					{label: 'seeall', type: 'function'},
				],
			},
		);
		await mockTest(
			'mw.site.stats.us',
			{
				from: 14,
				options: [
					{label: 'users', type: 'constant'},
					{label: 'usersInGroup', type: 'function'},
				],
			},
		);
	});
	it('length operator', async () => {
		await mockTest(
			'#_',
			{
				from: 1,
				options: [{label: '_G', type: 'namespace'}],
			},
		);
	});
	it('binary operator', async () => {
		await mockTest(
			'a + n',
			{
				from: 4,
				options: [{label: 'next', type: 'function'}],
			},
		);
	});
	it('field name', async () => {
		await mockTest(
			'a[ n',
			{
				from: 3,
				options: [{label: 'next', type: 'function'}],
			},
		);
	});
	it('table constructor', async () => {
		await mockTest(
			'{ f',
			{
				from: 2,
				options: [
					{label: 'false', type: 'constant'},
					{label: 'function', type: 'keyword'},
					{label: 'function', type: 'keyword', detail: 'definition'},
				],
			},
		);
	});
	it('parentheses', async () => {
		await mockTest(
			'f( n',
			{
				from: 3,
				options: nil,
			},
		);
	});
	it('assignment', async () => {
		await mockTest(
			'a = n',
			{
				from: 4,
				options: nil,
			},
		);
		await mockTest(
			'a, b = 0, n',
			{
				from: 10,
				options: nil,
			},
		);
	});
	it('closing bracket', async () => {
		await mockTest(
			'{0} o',
			{
				from: 4,
				options: [{label: 'or', type: 'keyword'}],
			},
		);
		await mockTest(
			'a[0] t',
			{
				from: 5,
				options: [{label: 'then', type: 'keyword'}],
			},
		);
	});
	it('newline', async () => {
		await mockTest(
			'  f',
			{
				from: 2,
				options: [
					{label: 'for', type: 'keyword'},
					{label: 'for', type: 'keyword', detail: 'loop'},
					{label: 'for', type: 'keyword', detail: 'in loop'},
					{label: 'function', type: 'keyword'},
					{label: 'function', type: 'keyword', detail: 'definition'},
					{label: 'false', type: 'constant'},
				],
			},
		);
		await mockTest(
			'f(); re',
			{
				from: 5,
				options: [
					{label: 'repeat', type: 'keyword'},
					{label: 'repeat', type: 'keyword', detail: 'loop'},
					{label: 'return', type: 'keyword'},
					{label: 'require', type: 'function'},
				],
			},
		);
	});
	it('space', async () => {
		await mockTest(
			'a o',
			{
				from: 2,
				options: [{label: 'or', type: 'keyword'}],
			},
		);
		await mockTest(
			'a or o',
			{
				from: 5,
				options: [{label: 'os', type: 'namespace'}],
			},
		);
	});
});

describe('Lua folding', () => {
	it('no folding', () => {
		foldTest('a\n\nb', null);
		foldTest('\ta\n\t\t\n    b', null);
		foldTest('\ta\nb', null);
	});
	it('folding', () => {
		foldTest('a\n\tb\n\tc\nd', {from: 1, to: 7});
		foldTest('a\n  b\n    c\n  d\ne', {from: 1, to: 15});
		foldTest('\ta\n\t\tb\n\tc', {from: 2, to: 6});
	});
});

describe('LDoc', () => {
	it('line comment', () => {
		markTest(
			`---
				-- @module test
				-- @tparam {}
				-- @treturn {string,...}

				-- @alias M`,
			[[11, 18], [31, 38], [49, 57]],
			[[39, 41], [58, 70]],
		);
	});
	it('block comment', () => {
		markTest(
			`--[[--
				@module test
				@tparam {}
				@treturn {string,...}
			]]
			-- @alias M`,
			[[11, 18], [28, 35], [43, 51]],
			[[36, 38], [52, 64]],
		);
	});
});
