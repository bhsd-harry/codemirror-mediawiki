import * as assert from 'assert';
import {syntaxTree} from '@codemirror/language';
import {javascript} from '@codemirror/lang-javascript';
import {css} from '@codemirror/lang-css';
import {json} from '@codemirror/lang-json';
import lua from '../src/lua';
import {findEnclosingBrackets, findEnclosingPlainBrackets} from '../src/matchBrackets';
import {createState} from './util';
import type {LanguageSupport, Config, MatchResult} from '@codemirror/language';

declare type Result = [number, number];

const javascriptLanguage = javascript(),
	cssLanguage = css(),
	jsonLanguage = json(),
	luaLanguage = lua(),
	config: Config = {
		brackets: '()[]{}',
		maxScanDistance: 1e4,
	};

const mockTest = (bracket: MatchResult | null | undefined, result?: Result | null): void => {
		assert.deepStrictEqual(
			bracket && [bracket.start.from, bracket.end?.from],
			result,
		);
	},
	lezerTest = (doc: string, lang: LanguageSupport, pos: number, result?: Result): void => {
		const node = syntaxTree(createState(doc, lang)).resolveInner(pos, -1),
			bracket = findEnclosingBrackets(node, pos, config.brackets!);
		mockTest(bracket, result);
	},
	plainTest = (doc: string, lang: LanguageSupport | undefined, pos: number, result: Result | null): void => {
		const state = createState(doc, lang),
			bracket = findEnclosingPlainBrackets(state, pos, config as Required<Config>);
		mockTest(bracket, result);
	};

describe('bracketMatching (Lezer)', () => {
	it('JavaScript', () => {
		lezerTest('a = {a: 1};', javascriptLanguage, 4);
		lezerTest('a = {a: 1};', javascriptLanguage, 10);
		lezerTest('a = {a: 1};', javascriptLanguage, 5, [4, 9]);
	});
	it('CSS', () => {
		lezerTest('a { top: 0 }', cssLanguage, 2);
		lezerTest('a { top: 0 }', cssLanguage, 12);
		lezerTest('a { top: 0 }', cssLanguage, 3, [2, 11]);
	});
	it('JSON', () => {
		lezerTest('[1, {"a": 1}]', jsonLanguage, 4, [0, 12]);
		lezerTest('[1, {"a": 1}]', jsonLanguage, 12, [0, 12]);
		lezerTest('[1, {"a": 1}]', jsonLanguage, 5, [4, 11]);
	});
});

describe('bracketMatching (plain)', () => {
	it('JavaScript', () => {
		plainTest('"(a)"', javascriptLanguage, 1, null);
		plainTest('"(a)"', javascriptLanguage, 4, null);
		plainTest('"(a)"', javascriptLanguage, 2, [3, 1]);
	});
	it('CSS', () => {
		plainTest('a { content: "(a)" }', cssLanguage, 14, [19, 2]);
		plainTest('a { content: "(a)" }', cssLanguage, 17, [19, 2]);
		plainTest('a { content: "(a)" }', cssLanguage, 15, [16, 14]);
	});
	it('JSON', () => {
		plainTest('"(a)"', jsonLanguage, 1, null);
		plainTest('"(a)"', jsonLanguage, 4, null);
		plainTest('"(a)"', jsonLanguage, 2, [3, 1]);
	});
	it('Lua', () => {
		plainTest('a = { 1 }', luaLanguage, 4, null);
		plainTest('a = { 1 }', luaLanguage, 9, null);
		plainTest('a = { 1 }', luaLanguage, 5, [8, 4]);
	});
	it('Wikitext', () => {
		plainTest('[[a|[b] ]]]', undefined, 4, [9, 1]);
		plainTest('[[a|[b] ]]]', undefined, 7, [9, 1]);
		plainTest('[[a|[b] ]]]', undefined, 5, [6, 4]);
	});
});
