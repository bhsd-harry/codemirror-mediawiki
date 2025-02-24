/* eslint-disable @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as assert from 'assert';
import parser, {checkNode} from './parser';

declare interface Token {
	text: string;
	name: string;
}
declare interface Test {
	desc: string;
	wikitext?: string;
	parsed?: string;
	html?: string;
	print?: string;
	render?: string;
}
declare type TestResult = Pick<Test, 'desc' | 'wikitext' | 'parsed'>;

const split = (test?: TestResult): string[] | undefined =>
	// eslint-disable-next-line es-x/no-regexp-lookbehind-assertions
	test?.parsed?.split(/(?<=<\/>)(?!$)|(?<!^)(?=<\w)/u);

const tests: Test[] = require('wikiparser-node/test/parserTests.json'),
	results: TestResult[] = require('../../parserTests.json'),
	entities = {'<': '&lt;', '>': '&gt', '&': '&amp;'};
describe('Parser tests', () => {
	for (let i = tests.length - 1; i >= 0; i--) {
		const test = tests[i]!,
			{wikitext, desc} = test;
		if (wikitext) {
			it(desc, () => {
				try {
					let node = parser.parse(wikitext).topNode.firstChild;
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
					delete test.html;
					delete test.print;
					delete test.render;
					test.parsed = tokens.map(({name, text}) => {
						const escaped = text.replace(/[<>&]/gu, m => entities[m as '<' | '>' | '&']);
						return name.trim() ? `<${name}>${escaped}</>` : text;
					}).join('');
					assert.deepStrictEqual(split(test), split(results.find(({desc: d}) => d === desc)));
				} catch (e) {
					if (!(e instanceof assert.AssertionError)) {
						tests.splice(i, 1);
					}
					if (e instanceof Error) {
						e.cause = {message: `\n${wikitext}`};
					}
					throw e;
				}
			});
		}
	}
	after(() => {
		fs.writeFileSync(
			'test/parserTests.json',
			`${JSON.stringify(tests, null, '\t')}\n`,
		);
	});
});
