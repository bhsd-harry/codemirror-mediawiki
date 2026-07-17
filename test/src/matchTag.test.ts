import * as assert from 'assert';
import {describe, it} from '@bhsd/test-util/mocha';
import {syntaxTree} from '@codemirror/language';
import {matchTag, WikiTag, getTag} from '../../dist/matchTag.js';
import {tokens} from '../../dist/config.js';
import {createState} from './util.js';

declare interface TagMatchResult {
	matched: boolean;
	start: [number, number];
	end?: [number, number];
}

const classTest = (
	doc: string,
	type: 'ext' | 'html',
	name: string,
	selfClosing: boolean,
	closing: boolean,
	from: number,
	to: number,
	pos?: number,
): void => {
	const state = createState(doc),
		tree = syntaxTree(state),
		first = pos === undefined ? tree.topNode.firstChild! : tree.resolve(pos, 1);
	let {nextSibling} = first;
	while (nextSibling && !nextSibling.name.includes(tokens[`${type}TagBracket`])) {
		({nextSibling} = nextSibling);
	}
	const tag = new WikiTag(type, name, first, nextSibling!, state);
	assert.strictEqual(tag.selfClosing, selfClosing);
	assert.strictEqual(tag.closing, closing);
	assert.strictEqual(tag.from, from);
	assert.strictEqual(tag.to, to);
};

const tagTest = (doc: string, pos: number, name: string, range: [number, number] | null): void => {
	const state = createState(doc),
		node = syntaxTree(state).resolve(pos, 1),
		tag = getTag(state, node);
	assert.ok(node.name.split('_').includes(name));
	assert.deepStrictEqual(tag && [tag.from, tag.to], range);
};

const mockTest = (doc: string, pos: number, result: TagMatchResult | null): void => {
	const tag = matchTag(createState(doc), pos);
	assert.deepStrictEqual(
		tag && {
			matched: tag.matched,
			start: [tag.start.from, tag.start.to],
			...tag.end && {end: [tag.end.from, tag.end.to]},
		},
		result,
	);
};

describe('WikiTag', () => {
	it('void tag', () => {
		classTest('<br>', 'html', 'br', true, false, 0, 4);
		classTest('<wbr/>', 'html', 'wbr', true, false, 0, 6);
	});
	it('self-closing tag', () => {
		classTest('<li/>', 'html', 'li', true, false, 0, 5);
		classTest('<ref name="foo" />', 'ext', 'ref', true, false, 0, 18);
	});
	it('opening tag', () => {
		classTest('<p>', 'html', 'p', false, false, 0, 3);
		classTest('<ref></ref>', 'ext', 'ref', false, false, 0, 5);
	});
	it('closing tag', () => {
		classTest('<p></p>', 'html', 'p', false, true, 3, 7, 3);
		classTest('<ref></ref>', 'ext', 'ref', false, true, 5, 11, 5);
	});
});

describe('getTag', () => {
	it('not tag', () => {
		tagTest('[[a]]<p>', 4, tokens.linkBracket, null);
		tagTest('<ref/>{{b}}', 6, tokens.templateBracket, null);
	});
	it('tag bracket', () => {
		tagTest('<p>', 0, tokens.htmlTagBracket, null);
		tagTest('<ref></ref>', 5, tokens.extTagBracket, null);
	});
	it('incomplete tag', () => {
		tagTest('<p id=', 3, tokens.htmlTagAttribute, null);
		tagTest('<ref name=', 5, tokens.extTagAttribute, null);
	});
	it('tag name', () => {
		tagTest('<p id="a">', 1, tokens.htmlTagName, [0, 10]);
		tagTest('<ref name="b"/>', 2, tokens.extTagName, [0, 15]);
	});
	it('tag attribute', () => {
		tagTest('<p id="a">', 4, tokens.htmlTagAttribute, [0, 10]);
		tagTest('<ref name="b"/>', 7, tokens.extTagAttribute, [0, 15]);
	});
	it('tag attribute value', () => {
		tagTest('<p id="a">', 8, tokens.htmlTagAttributeValue, [0, 10]);
		tagTest('<ref name="b"/>', 11, tokens.extTagAttributeValue, [0, 15]);
		tagTest('<templatestyles src="c.css" />', 22, tokens.extTagAttributeValue, [0, 30]);
	});
});

describe('tagMatching', () => {
	it('void extension tag', () => {
		mockTest('<templatestyles src="styles.css" />', 1, {matched: true, start: [1, 15]});
	});
	it('opening extension tag', () => {
		mockTest('<pre>a</pre>', 1, {matched: true, start: [1, 4], end: [8, 11]});
	});
	it('closing extension tag', () => {
		mockTest('<pre>a</pre>', 8, {matched: true, start: [8, 11], end: [1, 4]});
	});
	it('unmatched extension tag', () => {
		mockTest('<pre>', 1, {matched: false, start: [1, 4]});
	});
	it('void HTML tag', () => {
		mockTest('<br>', 1, {matched: true, start: [1, 3]});
	});
	it('opening HTML tag', () => {
		mockTest('<span><span></span></span>', 1, {matched: true, start: [1, 5], end: [21, 25]});
		mockTest('<span><span></span></span>', 7, {matched: true, start: [7, 11], end: [14, 18]});
	});
	it('closing HTML tag', () => {
		mockTest('<span><span></span></span>', 21, {matched: true, start: [21, 25], end: [1, 5]});
	});
	it('unmatched HTML tag', () => {
		mockTest('<span><span></span>', 1, {matched: false, start: [1, 5]});
	});
	it('valid self-closing HTML tag', () => {
		mockTest('<li/>', 1, {matched: true, start: [1, 3]});
		mockTest('<li><li/></li>', 1, {matched: true, start: [1, 3], end: [11, 13]});
		mockTest('<li><li/></li>', 11, {matched: true, start: [11, 13], end: [1, 3]});
	});
	it('invalid self-closing HTML tag', () => {
		mockTest('<p/>', 1, {matched: false, start: [1, 2]});
	});
});
