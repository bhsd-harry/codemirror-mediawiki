import {
	getWikiLinter,
} from './linter.js';
import {
	posToIndex,
	toConfigGetter,
} from './util.js';
import {base} from './constants.js';
import type {EditorView} from '@codemirror/view';
import type {
	Text,
} from '@codemirror/state';
import type {
	Diagnostic,
	Action,
	LintSource,
} from '@codemirror/lint';
import type {
	QuickFixData,
	ConfigData,
} from 'wikiparser-node';

declare type LintSourceGetter = (
	opt: ConfigData,
) => LintSource | Promise<LintSource>;

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
	opt: EditorView,
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

export const getWikiLintSource: LintSourceGetter = async (configData): Promise<LintSource> => {
	const wikiLint = await getWikiLinter({getConfig: toConfigGetter(configData), cdn: base.CDN});
	const lintSource: LintSource = async view => {
		const {doc} = view.state;
		return wikiLintSource(wikiLint, doc.toString(), view, doc);
	};
	return lintSource;
};
