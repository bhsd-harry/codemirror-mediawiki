import * as path from 'path';
import {StreamLanguage} from '@codemirror/language';
import {math} from '../src/math';

const {parser} = StreamLanguage.define(math);

const mathTest = <T>(file: string, callback: (tests: T) => [string, string | unknown[]][]): void => {
	describe(file, () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const tests: T = require(path.join('wikiparser-node', 'test', 'texvcjs', `${file}.json`));
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

mathTest<{input: string, inputhash: string}[]>(
	'chem-regression',
	tests => tests.map(({input, inputhash}) => [inputhash, input]),
);

mathTest<{input: string, texvcjs?: string, id: number}[]>(
	'mathjax-texvc',
	tests => tests.map(({input, texvcjs, id}) => [String(id), [input, texvcjs]]),
);

mathTest<Record<string, string>>('en-wiki-formulae-bad', Object.entries);
mathTest<Record<string, string>>('en-wiki-formulae-good', Object.entries);
