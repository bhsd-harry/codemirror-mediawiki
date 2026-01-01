import {
	getWikiLinter,
} from './linter';
import {posToIndex} from './util';
import type {EditorView} from '@codemirror/view';
import type {EditorState, Text} from '@codemirror/state';
import type {Language} from '@codemirror/language';
import type {Diagnostic, Action} from '@codemirror/lint';
import type {QuickFixData} from 'wikiparser-node';
import type {Option, LiveOption} from './linter';

export type LintSource =
	(state: EditorState) => Diagnostic[] | Promise<Diagnostic[]>;
export type LintSources = LintSource | [LintSource] | [LintSource, LintSource];
export type LintSourceGetter = (
	cdn?: string,
	opt?: Option | LiveOption,
	view?: EditorView,
	nestedMWLanguage?: Language,
) => LintSource | Promise<LintSource>;

/**
 * 获取Linter选项
 * @param opt Linter选项
 * @param runtime 是否为运行时选项
 */
export const getOpt = (opt: Option | LiveOption, runtime?: boolean): Option | Promise<Option> =>
	typeof opt === 'function' ? opt(runtime) : opt;

/**
 * 获取指定行列的位置
 * @param doc 文档
 * @param line 行号
 * @param column 列号
 * @param from 子语言起始位置
 */
const pos = (doc: Text, line: number, column: number, from = 0): number => {
	if (from === 0) {
		return posToIndex(doc, {line: line - 1, character: column - 1});
	}
	const lineDesc = doc.lineAt(from);
	return posToIndex(doc, {
		line: lineDesc.number + line - 2,
		character: (line === 1 ? from - lineDesc.from : 0) + column - 1,
	});
};

const getRange = (
	doc: Text,
	line: number,
	column: number,
	endLine?: number,
	endColumn?: number,
	f = 0,
	t = Infinity,
): {from: number, to: number} => {
	const start = pos(doc, line, column, f);
	return {
		from: start,
		to: endLine === undefined ? Math.min(t, start + 1) : pos(doc, endLine, endColumn!, f),
	};
};

const wikiLintSource = async (
	wikiLint: Awaited<ReturnType<typeof getWikiLinter>>,
	text: string,
	opt: Option,
	doc: Text,
	f = 0,
	t?: number,
): Promise<Diagnostic[]> => (await wikiLint(text, opt))
	.map(({severity, code, message, range: r, from, to, data = [], source}): Diagnostic => ({
		source: source!,
		severity: severity === 2 ? 'warning' : 'error',
		message: source === 'Stylelint' ? message : `${message} (${code})`,
		actions: (data as QuickFixData[]).map(({title, range, newText}): Action => ({
			name: title,
			apply(view): void {
				view.dispatch({
					changes: {
						from: posToIndex(doc, range.start),
						to: posToIndex(doc, range.end),
						insert: newText,
					},
				});
			},
		})),
		...from === undefined
			? getRange(doc, r!.start.line + 1, r!.start.character + 1, r!.end.line + 1, r!.end.character + 1, f, t)
			: {from: from + f, to: (to ?? from) + f},
	}));

export const getWikiLintSource: LintSourceGetter = async (cdn, opt, v): Promise<LintSource> => {
	const wikiLint = await getWikiLinter({...await getOpt(opt), cdn}, v);
	const lintSource: LintSource = async ({doc}) =>
		wikiLintSource(wikiLint, doc.toString(), await getOpt(opt, true), doc);
	return lintSource;
};
