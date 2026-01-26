import * as assert from 'assert';
import {syntaxTree} from '@codemirror/language';
import {javascript} from '@codemirror/lang-javascript';
import {css} from '@codemirror/lang-css';
import {json} from '@codemirror/lang-json';
import lua from '../src/lua';
import {
	findEnclosingBrackets,
	findEnclosingPlainBrackets,
	trySelectMatchingBrackets,
	selectMatchingBrackets,
} from '../src/matchBrackets';
import {createState} from './util';
import type {LanguageSupport, Config, MatchResult} from '@codemirror/language';
import type {Selection} from '../src/matchBrackets';

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
		const node = syntaxTree(createState(doc, lang)).resolveInner(pos, -1);
		mockTest(findEnclosingBrackets(node, pos, config.brackets!), result);
	},
	plainTest = (doc: string, lang: LanguageSupport | undefined, pos: number, result: Result | null): void => {
		mockTest(findEnclosingPlainBrackets(createState(doc, lang), pos, config as Required<Config>), result);
	},
	trySelectTest = (doc: string, pos: number, assoc: 1 | -1, inside: boolean, result: Selection | false): void => {
		assert.deepStrictEqual(
			trySelectMatchingBrackets(createState(doc, []), pos, assoc, undefined, inside),
			result,
			`pos: ${pos}, assoc: ${assoc}, inside: ${inside}`,
		);
	},
	selectTest = (doc: string, pos: number, result: Selection | false): void => {
		assert.deepStrictEqual(
			selectMatchingBrackets(createState(doc, []), pos),
			result,
			`pos: ${pos}`,
		);
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

describe('select bracket pair on one side', () => {
	it('outside', () => {
		trySelectTest(' [text] ', 1, 1, false, {anchor: 1, head: 7});
		trySelectTest(' [text] ', 1, -1, false, false);
		trySelectTest(' [text] ', 2, -1, false, false);
		trySelectTest(' [text] ', 2, 1, false, false);
		trySelectTest(' [text] ', 7, -1, false, {anchor: 7, head: 1});
		trySelectTest(' [text] ', 7, 1, false, false);
		trySelectTest(' [text] ', 6, 1, false, false);
		trySelectTest(' [text] ', 6, -1, false, false);
	});
	it('inside', () => {
		trySelectTest(' [text] ', 1, 1, true, {anchor: 2, head: 6});
		trySelectTest(' [text] ', 3, -1, true, false);
		trySelectTest(' [text] ', 7, -1, true, {anchor: 6, head: 2});
		trySelectTest(' [text] ', 5, 1, true, false);
	});
});

describe('select bracket pair on both sides', () => {
	it('outside', () => {
		selectTest(' [text] ', 1, {anchor: 1, head: 7});
		selectTest(' [text] ', 7, {anchor: 7, head: 1});
	});
	it('inside', () => {
		selectTest(' [text] ', 2, {anchor: 2, head: 6});
		selectTest(' [text] ', 6, {anchor: 6, head: 2});
	});
});
