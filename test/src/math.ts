import * as path from 'path';
import {StreamLanguage} from '@codemirror/language';
import {Tag} from '@lezer/highlight';
import {math} from '../../dist/math.js';
import {extData} from '../../dist/constants.js';
import mathData from 'wikiparser-node/data/ext/math.json' with {type: 'json'};

extData['math'] = new Set(mathData);

math.tokenTable = {'mw-unknown': Tag.define()};
const {parser} = StreamLanguage.define(math);

const mathTest = async <T>(file: string, callback: (tests: T) => [string, string | unknown[]][]): Promise<void> => {
	const {default: tests}: {default: T} = await import(
		path.join(import.meta.resolve('wikiparser-node'), '..', '..', 'test', 'math', `${file}.json`),
		{with: {type: 'json'}},
	);
	describe(file, () => {
		for (const [inputhash, input] of callback(tests)) {
			it(inputhash, () => {
				if (typeof input === 'string') {
					parser.parse(input);
				} else {
					for (const item of input) {
						if (typeof item === 'string') {
							parser.parse(item);
						}
					}
				}
			});
		}
	});
};

await mathTest<{input: string, inputhash: string}[]>(
	'chem-regression',
	tests => tests.map(({input, inputhash}) => [inputhash, input]),
);

await mathTest<{input: string, texvcjs?: string, id: number}[]>(
	'mathjax-texvc',
	tests => tests.map(({input, texvcjs, id}) => [String(id), [input, texvcjs]]),
);

await mathTest<Record<string, string>>('en-wiki-formulae-bad', Object.entries);
await mathTest<Record<string, string>>('en-wiki-formulae-good', Object.entries);
