/* eslint-disable @typescript-eslint/no-require-imports */
import {mochaTest} from '@bhsd/test-util';
import parse, {checkNode} from './parser';

declare interface Token {
	text: string;
	name: string;
}

const entities = {'<': '&lt;', '>': '&gt', '&': '&amp;'};
mochaTest(
	require('../../parserTests.json'),
	wikitext => {
		let node = parse(wikitext);
		const tokens: Token[] = [];
		while (node) {
			checkNode(node);
			const {from, to} = node,
				name = node.name.replace(/_/gu, ' ')
					.replace(/mw-/gu, ''),
				last = tokens[tokens.length - 1];
			if (last?.name === name) {
				last.text += wikitext.slice(from, to);
			} else {
				tokens.push({text: wikitext.slice(from, to), name});
			}
			node = node.nextSibling;
		}
		return tokens.map(({name, text}) => {
			const escaped = text.replace(/[<>&]/gu, m => entities[m as '<' | '>' | '&']);
			return name.trim() ? `<${name}>${escaped}</>` : escaped;
		}).join('');
	},
);
