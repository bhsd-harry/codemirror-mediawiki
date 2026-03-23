import {styleText} from 'util';
import {Direction} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {javascript} from '@codemirror/lang-javascript';
import {execute} from '@bhsd/test-util';
import {computeIsolates} from '../src/bidi';
import {detectIndent} from '../src/indent';
import {markGlobalsAndDocTag} from '../src/javascript';
import lua, {markDocTag} from '../src/lua';
import parse, {checkNode} from './parser';
import {createState} from './util';
import type {EditorView} from '@codemirror/view';
import type {Extension} from '@codemirror/state';

const [,, lang] = process.argv,
	failed: string[] = [];

const log = (language: string): void => {
	console.info(styleText('green', `Testing ${language}...`));
};

const coding = (langSupport: Extension, ns: string, model: string, mark: typeof markDocTag): Promise<void> => execute(
	(content, title) => {
		const state = createState(content, langSupport),
			{length} = content,
			tree = ensureSyntaxTree(state, length, 300);
		detectIndent(state.doc, '\t', model);
		if (tree) {
			mark(tree, [{from: 0, to: length}], state);
		} else {
			failed.push(title);
		}
	},
	undefined,
	undefined,
	ns,
	model,
);

(async () => {
	if (!lang || lang === 'mediawiki') {
		log('MediaWiki');
		await execute(content => {
			let node = parse(content);
			while (node) {
				checkNode(node);
				node = node.nextSibling;
			}

			const state = createState(content);
			computeIsolates({
				visibleRanges: [{from: 0, to: content.length}],
				state,
				textDirection: Direction.RTL,
			} as Partial<EditorView> as EditorView);
		});
	}

	if (!lang || lang === 'javascript') {
		log('JavaScript');
		await coding(javascript(), '2|8', 'javascript', markGlobalsAndDocTag);
	}

	if (!lang || lang === 'lua') {
		log('Lua');
		await coding(lua(), '828', 'Scribunto', markDocTag);
	}

	if (failed.length > 0) {
		console.warn(styleText('yellow', 'Failed to fully parse the following files:'), failed);
	}
})();
