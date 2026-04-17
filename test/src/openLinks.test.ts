import {EventEmitter} from 'events';
import * as assert from 'assert';
import {mouseEventListener, getISBNParser} from '../../dist/openLinks.js';
import {createState} from './util.js';
import type {EditorView} from '@codemirror/view';

Object.assign(globalThis, {
	Element: EventEmitter,
	getComputedStyle() {
		return {textDecorationLine: 'underline'};
	},
	location: {protocol: 'https:'},
});

const element = new Element();

const mockTest = (doc: string, pos: number, assoc: 1 | -1, result?: string): void => {
	const e = Object.assign(new Event('click')),
		state = createState(doc),
		view = {
			state,
			posAndSideAtCoords() {
				return {pos, assoc};
			},
		} as Partial<EditorView> as EditorView;
	Object.defineProperty(e, 'target', {value: element});
	assert.strictEqual(mouseEventListener(e as MouseEvent, view, undefined), result);
};

describe('ISBN parser', () => {
	it('with $1', () => {
		const parser = getISBNParser('/wiki/$1')!;
		assert.strictEqual(
			parser('ISBN 1-234-56789-x'),
			'/wiki/Special:Booksources/123456789X',
		);
	});
	it('without $1', () => {
		const parser = getISBNParser('/wiki/')!;
		assert.strictEqual(
			parser('ISBN 1-234-56789-x'),
			'/wiki/Special:Booksources/123456789X',
		);
	});
});

describe('openLinks', () => {
	it('extlink-protocol', () => {
		mockTest('[news:a]', 1, 1, 'news:a');
		mockTest('[news:a]', 1, -1);
		mockTest('[news:a]', 6, -1, 'news:a');
		mockTest('[git://b b]', 1, 1, 'git://b');
		mockTest('[git://b b]', 1, -1);
		mockTest('[git://b b]', 7, -1, 'git://b');
		mockTest('[//c]', 1, 1, 'https://c');
		mockTest('[//c]', 1, -1);
		mockTest('[//c]', 3, -1, 'https://c');
	});
	it('extlink', () => {
		mockTest('[git://b b]', 8, -1, 'git://b');
		mockTest('[git://b b]', 8, 1);
		mockTest('[git://b b]', 7, 1, 'git://b');
		mockTest('[//c]', 4, -1, 'https://c');
		mockTest('[//c]', 4, 1);
		mockTest('[//c]', 3, 1, 'https://c');
	});
	it('RFC', () => {
		mockTest('RFC 1', 0, 1, 'https://datatracker.ietf.org/doc/html/rfc1');
		mockTest('RFC 1', 0, -1);
		mockTest('RFC 1', 5, -1, 'https://datatracker.ietf.org/doc/html/rfc1');
		mockTest('RFC 1', 5, 1);
	});
	it('PMID', () => {
		mockTest('PMID 2', 0, 1, 'https://pubmed.ncbi.nlm.nih.gov/2');
		mockTest('PMID 2', 0, -1);
		mockTest('PMID 2', 6, -1, 'https://pubmed.ncbi.nlm.nih.gov/2');
		mockTest('PMID 2', 6, 1);
	});
});
