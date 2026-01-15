import * as assert from 'assert';
import {offsetAt, indexToPos} from '../src/linter';

const wikitext = `<p style="top: 0;
left: 0;">`,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	css = `p#1{
top: 0; left: 0;
}`,
	range: [number, number] = [wikitext.indexOf('"') + 1, wikitext.lastIndexOf('"')];

const offsetTest = (lineOrOffset: number, column: number | undefined, offset: number): void => {
		assert.strictEqual(offsetAt(range, lineOrOffset, column), offset);
	},
	positionTest = (index: number, line: number, character: number): void => {
		assert.deepStrictEqual(indexToPos(wikitext, index), {line, character});
	};

describe('Stylelint position transformation', () => {
	it('diagnostic offset', () => {
		offsetTest(-2, 4, 10);
		offsetTest(-1, 3, 13);
		offsetTest(0, 1, 26);
	});
	it('quickfix offset', () => {
		offsetTest(4, undefined, 14);
		offsetTest(17, undefined, 26);
		offsetTest(-1, undefined, 10);
	});
	it('quickfix position', () => {
		positionTest(14, 0, 14);
		positionTest(26, 1, 8);
		positionTest(10, 0, 10);
	});
});
