import * as assert from 'assert';
import {describe, it} from '@bhsd/test-util/mocha';
import {syntaxTree} from '@codemirror/language';
import {highlightRef, needHover} from '../../dist/ref.js';
import {getTag} from '../../dist/matchTag.js';
import {createState} from './util.js';

const mockTest = (doc: string, pos: number, expected: boolean): void => {
	const state = createState(doc),
		tag = getTag(state, syntaxTree(state).resolve(pos));
	assert.strictEqual(needHover(state, tag!), expected);
};

describe('highlight <ref>', () => {
	const state = createState('');
	it('single line', () => {
		assert.strictEqual(
			highlightRef(state, '[[a]]'),
			'<span class="cm-mw-link-ground cm-mw-link-bracket">[[</span>'
			+ '<span class="cm-mw-link-ground cm-mw-link-pagename cm-mw-pagename">a</span>'
			+ '<span class="cm-mw-link-ground cm-mw-link-bracket">]]</span>',
		);
		assert.strictEqual(
			highlightRef(state, '<p>'),
			'<span class="cm-mw-htmltag-bracket">&lt;</span>'
			+ '<span class="cm-mw-htmltag-name">p</span>'
			+ '<span class="cm-mw-htmltag-bracket">></span>',
		);
	});
	it('multi line', () => {
		assert.strictEqual(
			highlightRef(state, '{|\n|}'),
			'<span class="cm-mw-table-bracket">{|</span>'
			+ '<br>'
			+ '<span class="cm-mw-table-bracket">|}</span>',
		);
	});
});

describe('<ref> hover', () => {
	it('not <ref>', () => {
		mockTest('<br>', 2, false);
		mockTest('<poem/>', 2, false);
	});
	it('not self-closing', () => {
		mockTest('<ref></ref>', 2, false);
		mockTest('<ref>', 2, false);
	});
	it('no name attribute', () => {
		mockTest('<ref/>', 2, false);
		mockTest('<ref group=foo/>', 2, false);
		mockTest('<ref name/>', 2, false);
	});
	it('empty name attribute', () => {
		mockTest('<ref name=""/>', 2, false);
		mockTest("<ref name=' '/>", 2, false);
		mockTest('<ref name= />', 2, false);
	});
	it('valid name attribute', () => {
		mockTest('<ref name="a"/>', 2, true);
		mockTest("<ref name='b'/>", 2, true);
		mockTest('<ref name=c/>', 2, true);
	});
});
