import {
	javascript as js,
	javascriptLanguage,
	scopeCompletionSource,
	localCompletionSource,
} from '@codemirror/lang-javascript';
import {Decoration} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {setDiagnosticsEffect} from '@codemirror/lint';
import {isGlobal} from '@bhsd/browser';
import {builtin} from './javascript-globals.js';
import {doctag, doctagMark} from './constants.js';
import {markDocTagType, pushDecoration, markLinks, getMarkPlugin} from './util.js';
import type {Extension, Range, EditorState} from '@codemirror/state';
import type {CompletionContext} from '@codemirror/autocomplete';
import type {Linter} from 'eslint';
import type {Mark} from './util';
import type {CodeMirror6, DecorationPlugin} from './codemirror';
import type {LintSource} from './lintsource';

export const jsCompletion = javascriptLanguage.data.of({autocomplete: scopeCompletionSource(globalThis)});

const globalsMark = Decoration.mark({class: 'cm-globals'}),
	varMark = Decoration.mark({class: `${doctag}-var`}),
	builtinGlobals = new Set(Object.keys(builtin));

/**
 * 忽略JavaScript正则表达式中的括号匹配
 * @param state
 * @param pos 位置
 * @test
 */
export const exclude = (state: EditorState, pos: number): boolean => javascriptLanguage.isActiveAt(state, pos, 0)
	&& syntaxTree(state).resolveInner(pos, 0).name === 'RegExp';

/**
 * 高亮显示全局变量和JSDoc标签
 * @ignore
 * @test
 */
export const markGlobalsAndDocTag: Mark = (tree, visibleRanges, state, cm) => {
	const decorations: Range<Decoration>[] = [];
	let allGlobals = builtinGlobals;
	if (typeof eslint === 'object' && 'environments' in eslint && cm?.lintSources.length && isGlobal('eslint')) {
		const {env, globals} = (cm.lintSources[0] as LintSource<Linter.LegacyConfig> | undefined)?.config ?? {};
		if (env || globals) {
			allGlobals = new Set(builtinGlobals);
			if (env) {
				for (const key in env) {
					const obj = (eslint.environments as Map<string, {globals: Record<string, false>}>).get(key)
						?.globals;
					if (obj) {
						for (const k in obj) {
							allGlobals.add(k);
						}
					}
				}
			}
			if (globals) {
				for (const k in globals) {
					allGlobals.add(k);
				}
			}
		}
	}
	for (const {from, to} of visibleRanges) {
		tree.iterate({
			from,
			to,
			enter({type, from: f, to: t}) {
				const name = state.sliceDoc(f, t),
					isBlockComment = type.is('BlockComment');
				if (!javascriptLanguage.isActiveAt(state, f)) {
					//
				} else if (type.is('VariableName') && allGlobals.has(name)) {
					const completions = localCompletionSource({state, pos: t, explicit: true} as CompletionContext);
					if (!completions?.options.some(({label}) => label === name)) {
						pushDecoration(decorations, globalsMark, f, t);
					}
				} else if (isBlockComment || type.is('LineComment')) {
					markLinks(name, decorations, f);
					if (isBlockComment && /^\/\*{2}(?!\*)/u.test(name)) {
						const comment = name.slice(2),
							pos = f + 2,
							mtAll = comment.matchAll(/^[ \t]*\*\s*(@[a-z]+)(\s+\{)?|\{(@[a-z]+)/dgimu);
						for (const mt of mtAll) {
							if (mt[3]) {
								const [start, end] = mt.indices![3]!;
								pushDecoration(decorations, doctagMark, pos + start, pos + end);
							} else {
								const index = markDocTagType(decorations, pos, mt),
									m = /^\s+([a-z_]\w*)\s+-/diu.exec(comment.slice(index));
								if (m) {
									const [start, end] = m.indices![1]!;
									pushDecoration(decorations, varMark, pos + index + start, pos + index + end);
								}
							}
						}
					}
				}
			},
		});
	}
	return Decoration.set(decorations, true);
};

export const markGlobalsAndDocTagPlugin = (cm?: CodeMirror6): DecorationPlugin => getMarkPlugin(
	markGlobalsAndDocTag,
	cm,
	({transactions}) => transactions.some(tr => tr.effects.some(e => e.is(setDiagnosticsEffect))),
);

export default (_?: unknown, cm?: CodeMirror6): Extension => [
	js(),
	jsCompletion,
	markGlobalsAndDocTagPlugin(cm),
];
