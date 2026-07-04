import * as assert from 'assert';
import {describe, it} from '@bhsd/test-util/mocha';
import Parser from 'wikiparser-node';
import {escapeHTML, escapeURI, escapeWiki} from '../../dist/escape.js';
import {createDispatchableView} from './util.js';

const lsp = Parser.createLanguageService() as unknown as Parameters<typeof escapeWiki>[1];

describe('escape', () => {
	it('escape named entities', () => {
		assert.strictEqual(escapeHTML('"'), '&quot;');
		assert.strictEqual(escapeHTML("'"), '&apos;');
		assert.strictEqual(escapeHTML('<'), '&lt;');
		assert.strictEqual(escapeHTML('>'), '&gt;');
		assert.strictEqual(escapeHTML('&'), '&amp;');
		assert.strictEqual(escapeHTML(' '), '&nbsp;');
	});
	it('escape numeric entities', () => {
		assert.strictEqual(escapeHTML('a'), '&#97;');
		assert.strictEqual(escapeHTML('汉'), '&#x6c49;');
	});
	it('decode URI', () => {
		assert.strictEqual(escapeURI('%3D'), '=');
	});
	it('encode URI', () => {
		assert.strictEqual(escapeURI('='), '%3D');
	});
	it('escape magic word', async () => {
		const view = createDispatchableView(
			'<ref name=foo/>\n<p id=bar>\n{|\n|[[baz|baz]]',
			[[0, 15], [16, 26], [27, 42]],
			{
				changes: [
					[15, '<ref name=foo/>'],
					1,
					[10, '<p id{{=}}bar>'],
					1,
					[15, '{{{!}}', '{{!}}[[baz|baz]]'],
				],
				selection: [[0, 15], [16, 30], [31, 54]],
			},
			[],
		);
		void escapeWiki(view, lsp);
		return view.dispatched;
	});
});
