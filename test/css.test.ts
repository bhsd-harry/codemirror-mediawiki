import {pathToFileURL} from 'url';
import css from '../src/css';
import {autocompletionTest, createState} from './util';
import type {CompletionSource, CompletionResult} from '@codemirror/autocomplete';
import type {Dialect} from '../src/codemirror';

const cssWideKeywords = new Set(['inherit', 'initial', 'revert', 'revert-layer', 'unset']);

Object.assign(globalThis, {
	CSS: {
		supports(_: string, value: string): boolean {
			return cssWideKeywords.has(value);
		},
	},
	document: {
		body: {
			style: {
				'-moz-user-select': '',
				'-webkit-box-sizing': '',
				'-webkit-user-select': '',
			},
		},
		currentScript: {
			src: pathToFileURL(require.resolve('luacheck-browserify')).href,
		},
		addEventListener(): void {
			//
		},
	},
});

const mockTest = (dialect?: Dialect): (doc: string, result: CompletionResult | null) => Promise<void> => {
	const lang = css(dialect),
		state = createState('*', lang),
		[source] = state.languageDataAt<CompletionSource>('autocomplete', 0);
	// eslint-disable-next-line require-unicode-regexp, regexp/no-empty-alternative
	return autocompletionTest(source!, lang, /^(\w[\w-]*|-\w[\w-]*|)$/);
};

describe('CSS autocompletion', () => {
	it('ValueName', async () => {
		const cssTest = mockTest();
		await cssTest('a { top: rev', {
			from: 9,
			options: [
				{label: 'revert', type: 'keyword', boost: 50},
				{label: 'revert-layer', type: 'keyword', boost: 50},
				{label: 'reverse', type: 'keyword'},
			],
		});
	});
	it('sanitized-css', async () => {
		const cssTest = mockTest('sanitized-css');
		await cssTest('a { -w', {
			from: 4,
			options: [{label: '-webkit-user-select', type: 'property', apply: '-webkit-user-select: '}],
		});
	});
});
