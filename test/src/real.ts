import * as fs from 'fs';
import * as path from 'path';
import {Direction} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {javascript} from '@codemirror/lang-javascript';
import {green, yellow, red, refreshStdout} from '@bhsd/nodejs';
import testUtil from '@bhsd/test-util';
import {computeIsolates} from '../../dist/bidi.js';
import {detectIndent} from '../../dist/indent.js';
import {markGlobalsAndDocTag} from '../../dist/javascript.js';
import lua, {markDocTag} from '../../dist/lua.js';
import parse, {checkNode} from './parser.js';
import jsonParse from './json.js';
import lyParse from './lilypond.js';
import {createState} from './util.js';
import type {EditorView} from '@codemirror/view';
import type {Extension} from '@codemirror/state';

const [,, lang] = process.argv,
	failed: string[] = [];

const log = (language: string): void => {
	console.info(green(`Testing ${language}...`));
};

const singleScript = (langSupport: Extension, model: string, mark: typeof markDocTag) =>
	(content: string, title: string): void => {
		const state = createState(content, langSupport),
			{length} = content,
			tree = ensureSyntaxTree(state, length, 300);
		detectIndent(state.doc, '\t', model);
		if (tree) {
			mark(tree, [{from: 0, to: length}], state);
		} else {
			failed.push(title);
		}
	};

const coding = (langSupport: Extension, ns: string, model: string, mark: typeof markDocTag): Promise<void> =>
	testUtil.execute(singleScript(langSupport, model, mark), undefined, undefined, ns, model);

const tryScripts = (
	callback: (content: string, title: string) => void,
	exts: string | string[],
	dir = '..',
	exclude: string[] = [],
): void => {
	exts = typeof exts === 'string' ? [exts] : exts;
	const rel = (arr: string[]): string[] => arr.map(s => `${dir}/**/${s}`),
		files = fs.globSync(rel(exts), {exclude: rel([...exclude, 'node_modules/**'])});
	console.log('开始检查本地文件：');
	let i = 0;
	for (const f of files) {
		const file = path.relative(dir, f);
		refreshStdout(`${++i} ${file}`);
		try {
			callback(fs.readFileSync(f, 'utf8'), file);
		} catch (e) {
			console.error(red(`\n解析 ${file} 文件时出错！`), e);
		}
	}
	console.log();
};

(async () => {
	if (!lang || lang === 'mediawiki') {
		log('MediaWiki');
		await testUtil.execute(content => {
			let node = parse(content);
			while (node) {
				checkNode(node);
				node = node.nextSibling;
			}

			computeIsolates({
				visibleRanges: [{from: 0, to: content.length}],
				state: createState(content),
				textDirection: Direction.RTL,
			} as Partial<EditorView> as EditorView);
		});
	}

	if (!lang || lang === 'javascript' || lang === 'local') {
		log('JavaScript');
		const langSupport = javascript();
		tryScripts(
			singleScript(langSupport, 'javascript', markGlobalsAndDocTag),
			['*.js', '*.[cm]js'],
			'..',
			['*.min.js', 'build/**'],
		);

		if (lang !== 'local') {
			await coding(langSupport, '2|8', 'javascript', markGlobalsAndDocTag);
		}
	}

	if (!lang || lang === 'lua' || lang === 'local') {
		log('Lua');
		const langSupport = lua();
		tryScripts(singleScript(langSupport, 'lua', markDocTag), '*.lua');

		if (lang !== 'local') {
			await coding(langSupport, '828', 'Scribunto', markDocTag);
		}
	}

	if (!lang || lang === 'json' || lang === 'local') {
		log('JSON');
		tryScripts(jsonParse, '*.json');
	}

	if (!lang || lang === 'lilypond' || lang === 'local') {
		log('LilyPond');
		tryScripts(lyParse, ['*.ly', '*.ily'], 'test/lilymusic');
	}

	if (failed.length > 0) {
		console.warn(yellow('Failed to fully parse the following files:'), failed);
	}
})();
