import * as fs from 'fs';
import * as path from 'path';
import {Direction} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {javascript} from '@codemirror/lang-javascript';
import {jsonLanguage, jsoncLanguage} from '@bhsd/lezer-json';
import {green, yellow, red, refreshStdout} from '@bhsd/nodejs';
import {execute} from '@bhsd/test-util';
import {computeIsolates} from '../../dist/bidi.js';
import {detectIndent} from '../../dist/indent.js';
import {markGlobalsAndDocTag} from '../../dist/javascript.js';
import lua, {markDocTag} from '../../dist/lua.js';
import parse, {checkNode} from './parser.js';
import jsonStreamParse from './json.js';
import lyParse from './lilypond.js';
import {createState} from './util.js';
import type {EditorView} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {LRLanguage} from '@codemirror/language';

const [,, lang] = process.argv,
	failed: [string, string][] = [];

const log = (language: string): void => {
	console.info(green(`Testing ${language}...`));
};

const strictParse = ({parser}: LRLanguage, model: string) => {
	const strictParser = parser.configure({strict: true});
	return (content: string, title: string): void => {
		try {
			strictParser.parse(content);
		} catch {
			failed.push([model, title]);
		}
	};
};

const singleScript = (langSupport: Extension, model: string, mark: typeof markDocTag) =>
	(content: string, title: string): void => {
		const state = createState(content, langSupport),
			{length} = content,
			tree = ensureSyntaxTree(state, length, 1e3);
		detectIndent(state.doc, '\t', model);
		if (tree) {
			mark(tree, [{from: 0, to: length}], state);
		} else {
			failed.push([model, title]);
		}
	};

const coding = (
	langSupport: Extension,
	grcnamespace: string,
	contentmodel: string,
	mark: typeof markDocTag,
): Promise<void> =>
	execute(singleScript(langSupport, contentmodel, mark), undefined, {grcnamespace, contentmodel});

const tryScripts = (
	callback: (content: string, title: string) => void,
	exts: string | string[],
	dir = '..',
	exclude: string[] = [],
): void => {
	exts = typeof exts === 'string' ? [exts] : exts;
	const rel = (arr: string[]): string[] => arr.map(s => `${dir}/**/${s}`);
	console.log('开始检查本地文件：');
	let i = 0;
	for (const f of fs.globSync(rel(exts), {exclude: rel([...exclude, 'node_modules/**'])})) {
		const file = path.relative(dir, f);
		refreshStdout(`${++i} ${file}`);
		try {
			callback(fs.readFileSync(f, 'utf8'), file);
		} catch (e) {
			console.error(red(`\n解析 ${file} 文件时出错！`));
			console.error(e);
		}
	}
	console.log();
};

(async () => {
	if (!lang || lang === 'mediawiki') {
		log('MediaWiki');
		await execute(content => {
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
		const jsonParse = strictParse(jsonLanguage, 'json'),
			jsoncParse = strictParse(jsoncLanguage, 'jsonc'),
			callback = (content: string, title: string): void => {
				jsonStreamParse(content);
				jsonParse(content, title);
				jsoncParse(content, title);
			};
		log('JSON');
		tryScripts(callback, '*.json');

		if (lang !== 'local') {
			await execute(
				(content, title) => {
					if (/\.(?:chart|tab|map)$/u.test(title)) {
						callback(content, title);
					}
				},
				undefined,
				{grcnamespace: '486', contentmodel: ''},
				[['Commons', 'https://commons.wikimedia.org/w']],
			);
		}
	}

	if (!lang || lang === 'lilypond' || lang === 'local') {
		log('LilyPond');
		tryScripts(lyParse, ['*.ly', '*.ily'], 'test/lilymusic');
	}

	if (failed.length > 0) {
		console.warn(yellow('Failed to fully parse the following files:'));
		console.warn(failed);
	}
})();
