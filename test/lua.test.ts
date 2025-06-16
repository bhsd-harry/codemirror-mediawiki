import luaLanguage, {lua} from '../src/lua';
import {autocompletionTest} from './util';
import type {CompletionSource} from '@codemirror/autocomplete';

const nil = [
		{label: 'nil', type: 'constant'},
		{label: 'next', type: 'function'},
		{label: 'not', type: 'keyword'},
	],
	lang = luaLanguage();

const mockTest = autocompletionTest(lua.languageData!['autocomplete'] as CompletionSource, lang, /^\w*$/u);

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
					{label: 'function', type: 'keyword'},
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
