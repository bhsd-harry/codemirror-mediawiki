import * as assert from 'assert';
import {StringStream as StringStreamBase} from '@codemirror/language';
import {isSolSyntax, lookahead} from '../src/token';
import type {StringStream, State} from '../src/token';

describe('syntax at SOL', () => {
	const mockTest = (str: string, table?: boolean, file?: boolean, result = true): void => {
		const stream = new StringStreamBase(str, 4, 2) as StringStream;
		assert.strictEqual(Boolean(isSolSyntax(stream, table, file)), result);
	};
	it('hr', () => {
		mockTest('----');
	});
	it('heading', () => {
		mockTest('== a ==');
	});
	it('list', () => {
		mockTest('* a');
		mockTest('# a');
		mockTest(': a');
		mockTest('; a');
	});
	it('table', () => {
		mockTest('{|', true);
		mockTest(' {|', true);
		mockTest(' :: {|', true);
		mockTest('{|', false, false, false);
		mockTest(' {|', false, false, false);
		mockTest(' :: {|', false, false, false);
	});
	it('file', () => {
		mockTest('* a', false, true, false);
		mockTest('# a', false, true, false);
		mockTest(': a', false, true, false);
		mockTest('; a', false, true, false);
	});
});

describe('lookahead RegExp', () => {
	const mockTest = (tags: string[], result: string): void => {
		const state = {data: {tags}} as State;
		assert.strictEqual(lookahead('<', state), result);
	};
	it('no <onlyinclude>', () => {
		mockTest(['pre', 'nowiki'], String.raw`<(?!!--|(?:pre|nowiki)(?:[\s/>]|$))`);
	});
	it('<onlyinclude>', () => {
		mockTest(['pre', 'nowiki', 'onlyinclude'], String.raw`<(?!!--|onlyinclude>|(?:pre|nowiki)(?:[\s/>]|$))`);
	});
});
