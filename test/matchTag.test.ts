import * as assert from 'assert';
import {syntaxTree} from '@codemirror/language';
import {matchTag, Tag, getTag} from '../src/matchTag';
import {tokens} from '../src/config';
import {createState} from './util';

declare interface TagMatchResult {
	matched: boolean;
	start: [number, number];
	end?: [number, number];
}

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

describe('Tag', () => {
	it('void tag', () => {
		let state = createState('<br>'),
			{topNode} = syntaxTree(state),
			tag = new Tag('html', 'br', topNode.firstChild!, topNode.lastChild!, state);
		assert.strictEqual(tag.first.name, tokens.htmlTagBracket);
		assert.strictEqual(tag.last.name, tokens.htmlTagBracket);
		assert.strictEqual(tag.selfClosing, true);
		assert.strictEqual(tag.closing, false);
		assert.strictEqual(tag.from, 0);
		assert.strictEqual(tag.to, 4);

		state = createState('<wbr/>');
		({topNode} = syntaxTree(state));
		tag = new Tag('html', 'wbr', topNode.firstChild!, topNode.lastChild!, state);
		assert.strictEqual(tag.first.name, tokens.htmlTagBracket);
		assert.strictEqual(tag.last.name, tokens.htmlTagBracket);
		assert.strictEqual(tag.selfClosing, true);
		assert.strictEqual(tag.closing, false);
		assert.strictEqual(tag.from, 0);
		assert.strictEqual(tag.to, 6);
	});
	it('self-closing tag', () => {
		let state = createState('<li/>'),
			{topNode} = syntaxTree(state),
			tag = new Tag('html', 'li', topNode.firstChild!, topNode.lastChild!, state);
		assert.strictEqual(tag.first.name, tokens.htmlTagBracket);
		assert.strictEqual(tag.last.name, tokens.htmlTagBracket);
		assert.strictEqual(tag.selfClosing, true);
		assert.strictEqual(tag.closing, false);
		assert.strictEqual(tag.from, 0);
		assert.strictEqual(tag.to, 5);

		state = createState('<ref name="foo" />');
		({topNode} = syntaxTree(state));
		tag = new Tag('ext', 'ref', topNode.firstChild!, topNode.lastChild!, state);
		assert.strictEqual(tag.first.name, tokens.extTagBracket);
		assert.strictEqual(tag.last.name, tokens.extTagBracket);
		assert.strictEqual(tag.selfClosing, true);
		assert.strictEqual(tag.closing, false);
		assert.strictEqual(tag.from, 0);
		assert.strictEqual(tag.to, 18);
	});
	it('opening tag', () => {
		let state = createState('<p>'),
			{topNode} = syntaxTree(state),
			tag = new Tag('html', 'p', topNode.firstChild!, topNode.lastChild!, state);
		assert.strictEqual(tag.first.name, tokens.htmlTagBracket);
		assert.strictEqual(tag.last.name, tokens.htmlTagBracket);
		assert.strictEqual(tag.selfClosing, false);
		assert.strictEqual(tag.closing, false);
		assert.strictEqual(tag.from, 0);
		assert.strictEqual(tag.to, 3);

		state = createState('<ref></ref>');
		({topNode} = syntaxTree(state));
		tag = new Tag(
			'ext',
			'ref',
			topNode.firstChild!,
			topNode.firstChild!.nextSibling!.nextSibling!,
			state,
		);
		assert.strictEqual(tag.first.name, tokens.extTagBracket);
		assert.strictEqual(tag.last.name, tokens.extTagBracket);
		assert.strictEqual(tag.selfClosing, false);
		assert.strictEqual(tag.closing, false);
		assert.strictEqual(tag.from, 0);
		assert.strictEqual(tag.to, 5);
	});
	it('closing tag', () => {
		let state = createState('<p></p>'),
			{topNode} = syntaxTree(state),
			tag = new Tag(
				'html',
				'p',
				topNode.firstChild!.nextSibling!.nextSibling!,
				topNode.lastChild!,
				state,
			);
		assert.strictEqual(tag.first.name, tokens.htmlTagBracket);
		assert.strictEqual(tag.last.name, tokens.htmlTagBracket);
		assert.strictEqual(tag.selfClosing, false);
		assert.strictEqual(tag.closing, true);
		assert.strictEqual(tag.from, 3);
		assert.strictEqual(tag.to, 7);

		state = createState('<ref></ref>');
		({topNode} = syntaxTree(state));
		tag = new Tag(
			'ext',
			'ref',
			topNode.firstChild!.nextSibling!.nextSibling!,
			topNode.lastChild!,
			state,
		);
		assert.strictEqual(tag.first.name, tokens.extTagBracket);
		assert.strictEqual(tag.last.name, tokens.extTagBracket);
		assert.strictEqual(tag.selfClosing, false);
		assert.strictEqual(tag.closing, true);
		assert.strictEqual(tag.from, 5);
		assert.strictEqual(tag.to, 11);
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
		mockTest('<templatestyles src="styles.css" />', 1, {matched: true, start: [0, 35]});
	});
	it('opening extension tag', () => {
		mockTest('<pre>a</pre>', 1, {matched: true, start: [0, 5], end: [6, 12]});
	});
	it('closing extension tag', () => {
		mockTest('<pre>a</pre>', 8, {matched: true, start: [6, 12], end: [0, 5]});
	});
	it('unmatched extension tag', () => {
		mockTest('<pre>', 1, {matched: false, start: [0, 5]});
	});
	it('void HTML tag', () => {
		mockTest('<br>', 1, {matched: true, start: [0, 4]});
	});
	it('opening HTML tag', () => {
		mockTest('<span><span></span></span>', 1, {matched: true, start: [0, 6], end: [19, 26]});
		mockTest('<span><span></span></span>', 7, {matched: true, start: [6, 12], end: [12, 19]});
	});
	it('closing HTML tag', () => {
		mockTest('<span><span></span></span>', 21, {matched: true, start: [19, 26], end: [0, 6]});
	});
	it('unmatched HTML tag', () => {
		mockTest('<span><span></span>', 1, {matched: false, start: [0, 6]});
	});
	it('valid self-closing HTML tag', () => {
		mockTest('<li/>', 1, {matched: true, start: [0, 5]});
		mockTest('<li><li/></li>', 1, {matched: true, start: [0, 4], end: [9, 14]});
		mockTest('<li><li/></li>', 11, {matched: true, start: [9, 14], end: [0, 4]});
	});
	it('invalid self-closing HTML tag', () => {
		mockTest('<p/>', 1, {matched: false, start: [0, 4]});
	});
});
