import {EventEmitter} from 'events';
import * as assert from 'assert';
import {mouseEventListener} from '../src/openLinks';
import {createState} from './util';
import type {EditorView} from '@codemirror/view';

Object.assign(globalThis, {
	Element: EventEmitter,
	getComputedStyle() {
		return {textDecorationLine: 'underline'};
	},
	location: {protocol: 'https:'},
});

const element = new Element();

const mockTest = (doc: string, pos: number, result: string | undefined): void => {
	const e = Object.assign(new Event('click'), {metaKey: true, ctrlKey: true}),
		state = createState(doc),
		view = {
			state,
			posAtCoords() {
				return pos;
			},
		} as Partial<EditorView> as EditorView;
	Object.defineProperty(e, 'target', {value: element});
	assert.strictEqual(mouseEventListener(e as MouseEvent, view, undefined), result);
};

describe('openLinks', () => {
	it('extlink-protocol', () => {
		mockTest('[news:a]', 2, 'news:a');
		mockTest('[git://b b]', 2, 'git://b');
		mockTest('[//c]', 2, 'https://c');
	});
	it('extlink', () => {
		mockTest('[git://b b]', 7, 'git://b');
		mockTest('[//c]', 4, 'https://c');
	});
	it('RFC', () => {
		mockTest('RFC 1', 1, 'https://datatracker.ietf.org/doc/html/rfc1');
	});
	it('PMID', () => {
		mockTest('PMID 2', 1, 'https://pubmed.ncbi.nlm.nih.gov/2');
	});
});
