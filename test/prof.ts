import {readFileSync} from 'fs';
import {ensureSyntaxTree} from '@codemirror/language';
import {javascript} from '@codemirror/lang-javascript';
import {profile} from '@bhsd/nodejs';
import {markGlobalsAndDocTag} from '../src/javascript';
import parse from './parser';
import {createState} from './util';

const content = readFileSync('test/page.wiki', 'utf8'),
	[,, count, lang] = process.argv;
const callbacks: Record<string, () => void> = {
	mediawiki() {
		console.time('parser');
		for (let i = 0; i < (Number(count) || 10); i++) {
			parse(content);
		}
		console.timeEnd('parser');
	},
	javascript() {
		const state = createState(content, javascript()),
			{length} = content,
			tree = ensureSyntaxTree(state, length, 300);
		if (!tree) {
			throw new Error('Failed to parse JavaScript');
		}
		console.time('decoration');
		for (let i = 0; i < (Number(count) || 10); i++) {
			markGlobalsAndDocTag(tree, [{from: 0, to: length}], state);
		}
		console.timeEnd('decoration');
	},
};

(async () => {
	await profile(callbacks[lang!] ?? callbacks['mediawiki']!, 'test');
})();
