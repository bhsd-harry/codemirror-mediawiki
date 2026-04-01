import {ensureSyntaxTree} from '@codemirror/language';
import {cssLanguage} from '@codemirror/lang-css';
import {javascriptLanguage} from '@codemirror/lang-javascript';
import {sanitizeInlineStyle, lintJSON} from '@bhsd/common';
import {
	getWikiLinter,
	getJsLinter,
	getCssLinter,
	getLuaLinter,
	stylelintRepo,
	eslintRepo,
	luacheckRepo,
	isStylelintConfig,
} from './linter.js';
import {
	posToIndex,
	toConfigGetter,
} from './util.js';
import {baseData} from './constants.js';
import {vue} from './javascript-globals.js';
import type {EditorView} from '@codemirror/view';
import type {
	Text,
	EditorState,
} from '@codemirror/state';
import type {Language} from '@codemirror/language';
import type {
	Diagnostic,
	Action,
} from '@codemirror/lint';
import type {
	QuickFixData,
} from 'wikiparser-node';
import type {Rule, Linter} from 'eslint';
import type {Config} from 'stylelint';
import type {ConfigGetter} from '@bhsd/browser';
import type {Option, LiveOption} from './linter';
import type {DocRange} from './util';

export type LintSource<T = unknown> = (
	(state: EditorState) => readonly Diagnostic[] | Promise<readonly Diagnostic[]>
) & {
	config?: T;
	// eslint-disable-next-line @typescript-eslint/method-signature-style
	fixer?: (doc: Text, rule?: string) => string | Promise<string>;
};
export type LintSources = LintSource | [LintSource, ...LintSource[]];
export type LintSourceGetter = (
	opt?: Option | LiveOption,
	view?: EditorView,
	nestedMWLanguage?: Language,
) => LintSource | Promise<LintSource>;
export interface ExtendedAction extends Action {
	tooltip: string | undefined;
}

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
 * @test
 */
export const pos = (doc: Text, line: number, column: number, from = 0): number => {
	if (from === 0) {
		return posToIndex(doc, {line: line - 1, character: column - 1});
	}
	const lineDesc = doc.lineAt(from);
	return posToIndex(doc, {
		line: lineDesc.number + line - 2,
		character: (line === 1 ? from - lineDesc.from : 0) + column - 1,
	});
};

/**
 * 将行列范围转换为位置范围
 * @ignore
 * @test
 */
export const getRange = (
	doc: Text,
	line: number,
	column: number,
	endLine?: number,
	endColumn?: number,
	f = 0,
	t = Infinity,
): DocRange => {
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
						...getRange(
							doc,
							range.start.line + 1,
							range.start.character + 1,
							range.end.line + 1,
							range.end.character + 1,
							f,
							t,
						),
						insert: newText,
					},
				});
			},
		})),
		...from === undefined
			? getRange(doc, r!.start.line + 1, r!.start.character + 1, r!.end.line + 1, r!.end.character + 1, f, t)
			: {from: from + f, to: (to ?? from) + f},
	}));

/**
 * @implements
 * @test
 */
export const getWikiLintSource = (articlePath?: string): LintSourceGetter => async (
	opt,
	v,
): Promise<LintSource> => {
	const options = {...await getOpt(opt), cdn: baseData.CDN} as {
		getConfig?: ConfigGetter | undefined;
		cdn: string | undefined;
	};
	if (articlePath) {
		options.getConfig = toConfigGetter(options.getConfig, articlePath);
	}
	const wikiLint = await getWikiLinter(options, v);
	const lintSource: LintSource =
		async ({doc}) => {
			return wikiLintSource(
				wikiLint,
				doc.toString(),
				await getOpt(opt, true),
				doc,
			);
		};
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
				...fix ? [{name: 'fix', fix} as {name: string, fix: Rule.Fix, tooltip?: string}] : [],
				...suggestions.map(suggestion => ({
					name: suggestion.messageId || 'suggestion',
					fix: suggestion.fix,
					tooltip: suggestion.desc,
				})),
			].map(({name, fix: {range: [from, to], text}, tooltip}): ExtendedAction => ({
				name,
				tooltip,
				apply(view): void {
					view.dispatch({
						changes: {from: from + f, to: to + f, insert: text},
					});
				},
			}));
		}
		return diagnostic;
	});

/**
 * @implements
 * @test
 */
export const getJsLintSource: LintSourceGetter = async (opt): Promise<LintSource> => {
	const {CDN} = baseData,
		esLint = await getJsLinter(CDN && `${CDN}/${eslintRepo}`);
	const lintSource: LintSource = async ({doc}) => jsLintSource(esLint, doc.toString(), await getOpt(opt), doc);
	lintSource.fixer = (doc, rule): string => esLint.fixer!(doc.toString(), rule) as string;
	Object.defineProperty(lintSource, 'config', {
		get() {
			return esLint.config;
		},
	});
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

/**
 * @implements
 * @test
 */
export const getCssLintSource: LintSourceGetter = async (opt): Promise<LintSource> => {
	const {CDN} = baseData,
		styleLint = await getCssLinter(CDN && `${CDN}/${stylelintRepo}`);
	const lintSource: LintSource = async ({doc}) => cssLintSource(styleLint, doc.toString(), await getOpt(opt), doc);
	lintSource.fixer = async (doc, rule): Promise<string> => styleLint.fixer!(doc.toString(), rule);
	Object.defineProperty(lintSource, 'config', {
		get() {
			return styleLint.config;
		},
	});
	return lintSource;
};

/**
 * @author Yosuke Ota and others
 * @license MIT
 * @see https://github.com/ota-meshi/stylelint-config-recommended-vue/blob/main/lib/vue-specific-rules.js
 */
// eslint-disable-next-line unicorn/no-unreadable-iife
const stylelintConfigVue = /* #__PURE__ */ ((): Exclude<Config['rules'], undefined> => ({
	'selector-pseudo-class-no-unknown': [true, {ignorePseudoClasses: ['deep', 'global', 'slotted']}],
	'selector-pseudo-element-no-unknown': [true, {ignorePseudoElements: ['v-deep', 'v-global', 'v-slotted']}],
	'declaration-property-value-no-unknown': [true, {ignoreProperties: {'/.*/': String.raw`/v-bind\(.+\)/`}}],
	'function-no-unknown': [true, {ignoreFunctions: ['v-bind']}],
}))();

/** @implements */
const getVueOrHtmlLintSource = (rules?: Config['rules'], globals?: Linter.BaseConfig['globals']): LintSourceGetter =>
	async (opt): Promise<LintSource> => {
		const {CDN} = baseData,
			styleLint = await getCssLinter(CDN && `${CDN}/${stylelintRepo}`),
			esLint = await getJsLinter(CDN && `${CDN}/${eslintRepo}`);
		const lintSource: LintSource = async state => {
			const {doc} = state,
				option = await getOpt(opt, true) ?? {};
			let js = option['js'] as Linter.BaseConfig | null | undefined,
				css = option['css'] as Config | Config['rules'];
			if (rules) {
				css = isStylelintConfig(css)
					? {
						...css,
						rules: {...rules, ...css.rules},
					}
					: {...rules, ...css};
			}
			if (globals) {
				js = {...js, globals: {...globals, ...js?.globals}};
			}
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
				...javascriptLanguage.findRegions(state).flatMap(
					({from, to}) => jsLintSource(esLint, state.sliceDoc(from, to), js as Option, doc, from, to),
				),
			];
		};
		Object.defineProperty(lintSource, 'config', {
			get() {
				return esLint.config;
			},
		});
		return lintSource;
	};

/**
 * @implements
 * @test
 */
export const getVueLintSource = /* #__PURE__ */ getVueOrHtmlLintSource(stylelintConfigVue, vue);

/**
 * @implements
 * @test
 */
export const getHTMLLintSource: LintSourceGetter = async (opt, view, language): Promise<LintSource> => {
	const vueLintSource = await getVueOrHtmlLintSource()(opt),
		wikiLint = await getWikiLinter({include: false, ...await getOpt(opt), cdn: baseData.CDN}, view);
	const lintSource: LintSource = async state => {
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
	Object.defineProperty(lintSource, 'config', {
		get() {
			return vueLintSource.config;
		},
	});
	return lintSource;
};

/**
 * @implements
 * @test
 */
export const getJsonLintSource: LintSourceGetter = (): LintSource => ({doc}) => lintJSON(doc.toString())
	.map(({message, from, to = from, severity}): Diagnostic => ({message, severity, from, to}));

/**
 * @implements
 * @test
 */
export const getLuaLintSource: LintSourceGetter = async (): Promise<LintSource> => {
	const {CDN} = baseData,
		luaLint = await getLuaLinter(CDN && `${CDN}/${luacheckRepo}`);
	return async ({doc}) => (await luaLint(doc.toString()))
		.map(({line, column, end_column, msg: message, severity}): Diagnostic => ({
			source: 'Luacheck',
			message,
			severity: severity === 1 ? 'warning' : 'error',
			from: pos(doc, line, column),
			to: pos(doc, line, end_column + 1),
		}));
};
