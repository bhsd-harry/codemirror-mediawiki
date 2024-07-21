import * as fs from 'fs';
import * as parserTests from 'wikiparser-node/test/parserTests.json';
import parser from './parser';

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

const tests: Test[] = parserTests,
	entities = {'<': '&lt;', '>': '&gt', '&': '&amp;'};
for (let i = tests.length - 1; i >= 0; i--) {
	const test = tests[i]!,
		{wikitext} = test;
	if (wikitext) {
		try {
			let node = parser.parse(wikitext).topNode.firstChild;
			const tokens: Token[] = [];
			while (node) {
				const {from, to} = node,
					name = node.name.replace(/_+/gu, ' ').trim().replace(/mw-/gu, ''),
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
				return name ? `<${name}>${escaped}</>` : text;
			}).join('');
		} catch (e) {
			console.error(test);
			tests.splice(i, 1);
			throw e;
		}
	}
}
fs.writeFileSync('test/parserTests.json', `${JSON.stringify(tests, null, '\t')}\n`);
