import * as path from 'path';
import * as fs from 'fs';
import {fileURLToPath} from 'url';
import {describe, it, prepare} from '@bhsd/test-util/mocha';
import {StreamLanguage} from '@codemirror/language';
import {Tag} from '@lezer/highlight';
import {math} from '../../dist/math.js';
import {extData} from '../../dist/constants.js';
import mathData from 'wikiparser-node/data/ext/math.json' with {type: 'json'};

extData['math'] = new Set(mathData);

math.tokenTable = {'mw-unknown': Tag.define()};
const {parser} = StreamLanguage.define(math),
	isSkip = process.argv[2] === 'skip';

const mathTest = <T>(file: string, callback: (tests: T) => [string, string | unknown[]][]): void => {
	const tests: T = JSON.parse(fs.readFileSync(
		path.join(
			fileURLToPath(import.meta.resolve('wikiparser-node')),
			'..',
			'..',
			'test',
			'math',
			`${file}.json`,
		),
		'utf8',
	));
	describe(file, () => {
		const inputTests = callback(tests);
		if (isSkip) {
			prepare(inputTests.length);
		} else {
			for (const [inputhash, input] of inputTests) {
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
