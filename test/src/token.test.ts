import * as assert from 'assert';
import {describe, it} from '@bhsd/test-util/mocha';
import {StringStream as StringStreamBase} from '@codemirror/language';
import {isSolSyntax, lookahead, makeLocalStyle} from '../../dist/token.js';
import type {StringStream, State, NestCount} from '../../dist/token';

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

describe('local style', () => {
	const mockTest = (state: Partial<State>, result: string, endGround?: NestCount): Partial<State> => {
		assert.strictEqual(makeLocalStyle('foo', state as State, endGround), result);
		return state;
	};
	it('no endGround', () => {
		mockTest({nTemplate: 0, nExt: 0, nLink: 0, nExtLink: 0}, 'foo');
		mockTest({nTemplate: 4, nExt: 4, nLink: 1, nExtLink: 0}, 'mw-template3-ext3-link-ground foo');
	});
	it('with endGround', () => {
		let state = mockTest(
			{nTemplate: 0, nExt: 0, nLink: 0, nExtLink: 1},
			'mw-link-ground foo',
			'nExtLink',
		);
		assert.strictEqual(state.nExtLink, 0);
		state = mockTest(
			{nTemplate: 0, nExt: 1, nLink: 0, nExtLink: 0, dt: {n: 2, html: 0, nExt: 1}},
			'mw-ext-ground foo',
			'nExt',
		);
		assert.strictEqual(state.nExt, 0);
		assert.strictEqual(state.dt?.n, 0);
	});
});
