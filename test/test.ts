/* eslint-disable es-x/no-string-prototype-matchall */
import * as fs from 'fs';
import * as path from 'path';
import parser from './parser';

declare interface Token {
	text: string;
	name: string;
}

const tests: {desc: string, wikitext?: string, parsed?: string}[] = [],
	entities = {'<': '&lt;', '>': '&gt', '&': '&amp;'},
	cwd = '../wikiparser-node/test/core',
	files = new Set(fs.readdirSync(`${cwd}/`));
files.delete('parserTests.txt');
files.delete('indentPre.txt');
for (const file of ['parserTests.txt', ...files]) {
	tests.push({desc: file.slice(0, -4)});
	const content = fs.readFileSync(fs.realpathSync(path.join(cwd, file)), 'utf8'),
		cases = [...content.matchAll(/^!!\s*test\n.+?^!!\s*end$/gmsu)],
		// eslint-disable-next-line @stylistic/max-len
		re = /^!!\s*options(?:\n(?:parsoid=wt2html.*|(?:(?:subpage )?title|preprocessor|thumbsize)=.+|cat|subpage|showindicators|djvu|showmedia|showtocdata))*\n!/mu;
	for (const [test] of cases) {
		if (
			/^!!\s*html(?:\/(?:php|\*))?$/mu.test(test)
			&& (!test.includes('options') || re.test(test))
		) {
			try {
				const wikitext = /^!!\s*wikitext\n+((?!!!)[^\n].*?)^!!/msu.exec(test)?.[1]!.trimEnd(),
					desc = /^!!\s*test\n(.*?)\n!!/msu.exec(test)![1]!;
				if (wikitext) {
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
					tests.push({
						desc,
						wikitext,
						parsed: tokens.map(({name, text}) => `<${name}>${
							text.replace(/[<>&]/gu, m => entities[m as '<' | '>' | '&'])
						}</>`).join(''),
					});
				}
			} catch (e) {
				console.error(test);
				throw e;
			}
		}
	}
}
fs.writeFileSync('test/parserTests.json', `${JSON.stringify(tests, null, '\t')}\n`);
