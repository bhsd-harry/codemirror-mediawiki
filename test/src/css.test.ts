import {pathToFileURL} from 'url';
import * as assert from 'assert';
import {syntaxTree} from '@codemirror/language';
import {html} from '@codemirror/lang-html';
import {vue} from '@codemirror/lang-vue';
import {describe, it} from '@bhsd/test-util/mocha';
import css, {markLink} from '../../dist/css.js';
import {autocompletionTest, createState, convertFullRangeSet, filterFromRangeSet} from './util.js';
import type {LanguageSupport} from '@codemirror/language';
import type {CompletionSource, CompletionResult} from '@codemirror/autocomplete';
import type {Dialect} from '../../dist/codemirror';

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
			src: pathToFileURL(import.meta.resolve('luacheck-browserify')).href,
		},
		addEventListener(): void {
			//
		},
	},
});

const mockTest = (dialect?: Dialect): (doc: string, result: CompletionResult | null) => Promise<void> => {
	const lang = css(dialect),
		[source] = createState('*', lang).languageDataAt<CompletionSource>('autocomplete', 0);
	// eslint-disable-next-line require-unicode-regexp, regexp/no-empty-alternative
	return autocompletionTest(source!, lang, /^(\w[\w-]*|-\w[\w-]*|)$/);
};

const linkTest = (doc: string, links: [number, number][], lang = css(undefined)): void => {
	const state = createState(doc, lang),
		{length} = doc,
		set = markLink(syntaxTree(state), [{from: 0, to: length}], state);
	assert.deepStrictEqual(filterFromRangeSet(convertFullRangeSet(set, length), 'cm-link'), links);
};

const sublangTest = (name: string, lang: LanguageSupport): void => {
	it(`CSS nested in ${name}`, () => {
		linkTest(
			'<style>/* See https://www.w3.org/TR/css-flexbox-1/#min-size-auto */</style>',
			[[14, 64]],
			lang,
		);
	});
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

describe('links in CSS comments', () => {
	it('CSS', () => {
		linkTest('/* See https://www.w3.org/TR/css-flexbox-1/#min-size-auto */', [[7, 57]]);
	});
	sublangTest('HTML', html());
	sublangTest('Vue', vue());
});
