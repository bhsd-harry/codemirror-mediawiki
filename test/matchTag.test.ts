import * as assert from 'assert';
import {matchTag} from '../src/matchTag';
import {createState} from './util';

declare interface TagMatchResult {
	matched: boolean;
	start: [number, number];
	end?: [number, number];
}

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
