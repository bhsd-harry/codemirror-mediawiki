import * as assert from 'assert';
import html from '../src/html';
import {autocompletionTest, createState, mwConfig} from './util';
import type {CompletionSource} from '@codemirror/autocomplete';

const lang = html(mwConfig),
	state = createState('', lang),
	[source] = state.languageDataAt<CompletionSource>('autocomplete', 0);

// eslint-disable-next-line @stylistic/max-len
// eslint-disable-next-line require-unicode-regexp, no-useless-escape, regexp/no-useless-escape, regexp/letter-case, regexp/hexadecimal-escape
const mockTest = autocompletionTest(source!, lang, /^\/?[:\-\.\w\u00b7-\uffff]*$/);

const sublangTest = (doc: string, pos: number, langguagedata: string, data: unknown): void => {
	const st = createState(doc, lang);
	assert.deepStrictEqual(st.languageDataAt<unknown>(langguagedata, pos), data);
};

describe('HTML autocompletion', () => {
	it('extra tag', async () => {
		await mockTest(
			'<no',
			{
				from: 1,
				to: 3,
				options: [
					{label: 'noscript', type: 'type'},
					{label: 'noinclude', type: 'type'},
				],
			},
		);
	});
});

describe('HTML sublanguage', () => {
	it('<script>', () => {
		sublangTest('<head><script>const x = 1;</script></head>', 3, 'commentTokens', [
			{
				block: {open: '<!--', close: '-->'},
			},
		]);
		sublangTest('<head><script>const x = 1;</script></head>', 8, 'commentTokens', [
			{
				line: '//',
				block: {open: '/*', close: '*/'},
			},
		]);
	});
	it('<style>', () => {
		sublangTest('<head><style>* { all: revert }</style></head>', 3, 'commentTokens', [
			{
				block: {open: '<!--', close: '-->'},
			},
		]);
		sublangTest('<head><style>* { all: revert }</style></head>', 8, 'commentTokens', [
			{
				block: {open: '/*', close: '*/'},
			},
		]);
	});
	it('<noinclude>', () => {
		sublangTest('<br><noinclude>{{doc}}</noinclude>', 13, 'closeBrackets', []);
		sublangTest('<br><noinclude>{{doc}}</noinclude>', 16, 'closeBrackets', [
			{
				brackets: ['(', '[', '{', '"'],
				before: ')]}>',
			},
		]);
	});
	it('inline style', () => {
		sublangTest('<br style="all: revert">', 2, 'commentTokens', [
			{
				block: {open: '<!--', close: '-->'},
			},
		]);
		sublangTest('<br style="all: revert">', 12, 'commentTokens', [
			{
				block: {open: '/*', close: '*/'},
			},
		]);
	});
});
