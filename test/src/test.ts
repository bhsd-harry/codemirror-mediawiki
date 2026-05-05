import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import {mochaTest, split} from '@bhsd/test-util';
import parse, {checkNode, parsers} from './parser.js';
import tests from '../parserTests.json' with {type: 'json'};
import lezerTests from '../lezerTests.json' with {type: 'json'};
import type {SyntaxNode} from '@lezer/common';

declare interface Token {
	text: string;
	name: string;
}
declare interface ObjNode {
	name: string;
	from: number;
	to: number;
	children: ObjNode[];
}

const entities = {'<': '&lt;', '>': '&gt', '&': '&amp;'};
const escape = (str: string): string => str.replaceAll(/[<>&]/gu, m => entities[m as '<' | '>' | '&']);

mochaTest(
	tests,
	wikitext => {
		let node = parse(wikitext);
		const tokens: Token[] = [];
		while (node) {
			checkNode(node);
			const {from, to} = node,
				name = node.name.replaceAll('_', ' ')
					.replaceAll('mw-', ''),
				last = tokens.at(-1);
			if (last?.name === name) {
				last.text += wikitext.slice(from, to);
			} else {
				tokens.push({text: wikitext.slice(from, to), name});
			}
			node = node.nextSibling;
		}
		return tokens.map(({name, text}) => {
			const escaped = escape(text);
			return name.trim() ? `<${name}>${escaped}</>` : escaped;
		}).join('');
	},
);

const toObj = ({name, from, to, firstChild}: SyntaxNode): ObjNode => {
	const node: ObjNode = {
		name,
		from,
		to,
		children: [],
	};
	if (firstChild) {
		let child: SyntaxNode | null = firstChild;
		while (child) {
			if (child.from < child.to) {
				node.children.push(toObj(child));
			}
			child = child.nextSibling;
		}
	}
	return node;
};

const topNodes = new Set(['Document', 'StyleSheet', 'Script']);
const objToStr = (code: string, {name, from, to, children}: ObjNode): string => {
	const isToken = !topNodes.has(name) && /^\w+$/u.test(name);
	let output = isToken ? `<${name}>` : '',
		cur = from;
	for (const child of children) {
		output += escape(code.slice(cur, child.from)) + objToStr(code, child);
		cur = child.to;
	}
	output += escape(code.slice(cur, to)) + (isToken ? `</${name}>` : '');
	return output;
};

const dir = path.join('test', 'tests');
describe('Lezer parser tests', () => {
	for (const file of fs.readdirSync(dir)) {
		const lang = path.basename(file, '.txt') as keyof typeof parsers;
		it(`${lang} parser tests`, () => {
			const input = fs.readFileSync(path.join(dir, file), 'utf8'),
				printed = objToStr(input, toObj(parsers[lang].parse(input).topNode)),
				{output} = lezerTests[lang];
			lezerTests[lang] = {input, output: printed};
			assert.deepStrictEqual(split(printed), split(output));
		});
	}
	after(() => {
		fs.writeFileSync(
			path.join('test', 'lezerTests.json'),
			`${JSON.stringify(lezerTests, null, '\t')}\n`,
		);
	});
});
