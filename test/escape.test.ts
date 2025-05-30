import * as assert from 'assert';
import {escapeHTML, escapeURI} from '../src/escape';

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
});
