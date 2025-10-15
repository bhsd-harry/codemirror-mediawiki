import {ensureSyntaxTree} from '@codemirror/language';
import {cssLanguage} from '@codemirror/lang-css';
import {javascriptLanguage} from '@codemirror/lang-javascript';
import {sanitizeInlineStyle} from '@bhsd/common';
import {getWikiLinter, getJsLinter, getCssLinter, getJsonLinter, getLuaLinter} from './linter';
import {posToIndex} from './hover';
import type {EditorView} from '@codemirror/view';
import type {EditorState, Text} from '@codemirror/state';
import type {Language} from '@codemirror/language';
import type {Diagnostic, Action} from '@codemirror/lint';
import type {QuickFixData} from 'wikiparser-node';
import type {Option, LiveOption} from './linter';

export type LintSource = ((state: EditorState) => Diagnostic[] | Promise<Diagnostic[]>) & {
	// eslint-disable-next-line @typescript-eslint/method-signature-style
	fixer?: (doc: Text, rule?: string) => string | Promise<string>;
};
export type LintSources = LintSource | [LintSource] | [LintSource, LintSource];
export type LintSourceGetter = (
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

export const getWikiLintSource: LintSourceGetter = async (opt, v): Promise<LintSource> => {
	const wikiLint = await getWikiLinter(await getOpt(opt), v);
	const lintSource: LintSource = async ({doc}) =>
		wikiLintSource(wikiLint, doc.toString(), await getOpt(opt, true), doc);
	if (wikiLint.fixer) {
		lintSource.fixer = (_, rule): Promise<string> => wikiLint.fixer!('', rule) as Promise<string>;
	}
	return lintSource;
};

const jsLintSource = (
	esLint: Awaited<ReturnType<typeof getJsLinter>>,
	code: string,
	opt: Option,
	doc: Text,
	f = 0,
	t?: number,
): Diagnostic[] => esLint(code, opt)
	.map(({ruleId, message, severity, line, column, endLine, endColumn, fix, suggestions = []}) => {
		const diagnostic: Diagnostic = {
			source: 'ESLint',
			message: message + (ruleId ? ` (${ruleId})` : ''),
			severity: severity === 1 ? 'warning' : 'error',
			...getRange(doc, line, column, endLine, endColumn, f, t),
		};
		if (fix || suggestions.length > 0) {
			diagnostic.actions = [
				...fix ? [{name: 'fix', fix}] : [],
				...suggestions.map(suggestion => ({name: 'suggestion', fix: suggestion.fix})),
			].map(({name, fix: {range: [from, to], text}}): Action => ({
				name,
				apply(view): void {
					view.dispatch({
						changes: {from: from + f, to: to + f, insert: text},
					});
				},
			}));
		}
		return diagnostic;
	});

export const getJsLintSource: LintSourceGetter = async (opt): Promise<LintSource> => {
	const esLint = await getJsLinter();
	const lintSource: LintSource = async ({doc}) => jsLintSource(esLint, doc.toString(), await getOpt(opt), doc);
	lintSource.fixer = (doc, rule): string => esLint.fixer!(doc.toString(), rule) as string;
	return lintSource;
};

const cssLintSource = async (
	styleLint: Awaited<ReturnType<typeof getCssLinter>>,
	code: string,
	opt: Option,
	doc: Text,
	f = 0,
	t?: number,
): Promise<Diagnostic[]> => {
	let option = opt ?? {};
	if (!('extends' in option || 'rules' in option)) {
		option = {rules: option};
	}
	return (await styleLint(code, option))
		.map(({text, severity, line, column, endLine, endColumn, fix}): Diagnostic => {
			const diagnostic: Diagnostic = {
				source: 'Stylelint',
				message: text,
				severity,
				...getRange(doc, line, column, endLine, endColumn, f, t),
			};
			if (fix) {
				diagnostic.actions = [
					{
						name: 'fix',
						apply(view): void {
							view.dispatch({
								changes: {from: fix.range[0] + f, to: fix.range[1] + f, insert: fix.text},
							});
						},
					},
				];
			}
			return diagnostic;
		});
};

export const getCssLintSource: LintSourceGetter = async (opt): Promise<LintSource> => {
	const styleLint = await getCssLinter();
	const lintSource: LintSource = async ({doc}) => cssLintSource(styleLint, doc.toString(), await getOpt(opt), doc);
	lintSource.fixer = async (doc, rule): Promise<string> => styleLint.fixer!(doc.toString(), rule);
	return lintSource;
};

export const getVueLintSource: LintSourceGetter = async (opt): Promise<LintSource> => {
	const styleLint = await getCssLinter(),
		esLint = await getJsLinter();
	return async state => {
		const {doc} = state,
			option = await getOpt(opt, true) ?? {},
			js = option['js'] as Option,
			css = option['css'] as Option;
		return [
			...(await Promise.all(
				cssLanguage.findRegions(state).map(async ({from, to}): Promise<Diagnostic[]> => {
					const node = ensureSyntaxTree(state, from)?.resolve(from, 1);
					if (node?.name === 'AttributeValue') {
						return (await cssLintSource(
							styleLint,
							`a {${sanitizeInlineStyle(state.sliceDoc(from, to))}}`,
							css,
							doc,
							from - 3,
							to + 1,
						)).filter(({from: f, to: t}) => f <= to && t >= from)
							.map((diagnostic): Diagnostic => {
								diagnostic.from = Math.max(diagnostic.from, from);
								diagnostic.to = Math.min(diagnostic.to, to);
								return diagnostic;
							});
					}
					return node ? cssLintSource(styleLint, state.sliceDoc(from, to), css, doc, from, to) : [];
				}),
			)).flat(),
			...javascriptLanguage.findRegions(state)
				.flatMap(({from, to}) => jsLintSource(esLint, state.sliceDoc(from, to), js, doc, from, to)),
		];
	};
};

export const getHTMLLintSource: LintSourceGetter = async (opt, view, language): Promise<LintSource> => {
	const vueLintSource = await getVueLintSource(opt),
		wikiLint = await getWikiLinter({include: false, ...await getOpt(opt)}, view);
	return async state => {
		const {doc} = state,
			option = await getOpt(opt, true) ?? {},
			wiki = option['wiki'] as Option;
		return [
			...await vueLintSource(state),
			...(await Promise.all(
				language!.findRegions(state)
					.map(({from, to}) => wikiLintSource(wikiLint, state.sliceDoc(from, to), wiki, doc, from, to)),
			)).flat(),
		];
	};
};

export const getJsonLintSource: LintSourceGetter = (): LintSource => {
	const jsonLint = getJsonLinter();
	return ({doc}) => {
		const [e] = jsonLint(doc.toString());
		if (e) {
			const {message, severity, line, column, position} = e;
			let from = 0;
			if (position) {
				from = Number(position);
			} else if (line && column) {
				from = pos(doc, Number(line), Number(column));
			}
			return [{message, severity, from, to: from}];
		}
		return [];
	};
};

export const getLuaLintSource: LintSourceGetter = async (): Promise<LintSource> => {
	const luaLint = await getLuaLinter();
	return async ({doc}) => (await luaLint(doc.toString()))
		.map(({line, column, end_column: endColumn, msg: message, severity}): Diagnostic => ({
			source: 'Luacheck',
			message,
			severity: severity === 1 ? 'warning' : 'error',
			from: pos(doc, line, column),
			to: pos(doc, line, endColumn + 1),
		}));
};
