/* eslint-disable unicorn/no-unreadable-iife */
import {sanitizeInlineStyle} from '@bhsd/common';
import {loadScript, getWikiparse, getLSP} from '@bhsd/browser';
import {styleLint} from '@bhsd/stylelint-util';
import type {Diagnostic as DiagnosticBase, Range, Position} from 'vscode-languageserver-types';
import type {Linter} from 'eslint';
import type {Warning, Config} from 'stylelint';
import type {Diagnostic} from 'luacheck-browserify';
import type {ConfigData, QuickFixData, AST} from 'wikiparser-node';

export type Option = Record<string, unknown> | null | undefined;
export type LiveOption = (runtime?: boolean) => Option | Promise<Option>;
declare type getLinter<T> = () => (text: string) => T;
declare type asyncLinter<T, S = Record<string, unknown>> = ((text: string, config?: Option) => T) & {
	config?: S;
	// eslint-disable-next-line @typescript-eslint/method-signature-style
	fixer?: (code: string, rule?: string) => string | Promise<string>;
};

/**
 * @param opt 初始化选项
 * @param obj 仅用于wikiparse.LanguageService
 */
declare type getAsyncLinter<T, S = never, R = never> = (opt?: S, obj?: R) => Promise<asyncLinter<T>>;
declare interface MixedDiagnostic extends Omit<DiagnosticBase, 'range'> {
	range?: Range;
	from?: number;
	to?: number;
}

declare interface JsonError {
	message: string;
	severity: 'error';
	line: string | undefined;
	column: string | undefined;
	position: string | undefined;
}

/**
 * 计算位置
 * @param range 范围
 * @param lineOrOffset 行号或相对位置
 * @param column 列号
 */
const offsetAt = (range: [number, number], lineOrOffset: number, column?: number): number => {
	if (column === undefined) {
		return Math.min(range[1], range[0] + Math.max(0, lineOrOffset));
	} else if (lineOrOffset === -2) {
		return range[0];
	}
	return lineOrOffset === 0 ? range[1] : range[0] + column;
};

/**
 * 获取伪CSS代码块的前缀
 * @param token AST 节点
 * @param token.type 节点类型
 * @param token.tag 节点标签
 * @param i 节点序号
 */
const getPrefix = ({type, tag}: AST, i: number): string => `${type === 'ext-attr' ? 'div' : tag as string}#${i}{\n`;

/**
 * 将偏移量转换为位置
 * @param code 代码字符串
 * @param index 偏移量
 */
const indexToPos = (code: string, index: number): Position => {
	const lines = code.slice(0, index).split('\n');
	return {line: lines.length - 1, character: lines[lines.length - 1]!.length};
};

/**
 * 判断是否为 Stylelint 设置
 * @param config 设置
 */
const isStylelintConfig = (config?: Config | Config['rules']): config is Config =>
	Boolean(config && ('extends' in config || 'rules' in config));

/**
 * 获取 Wikitext LSP
 * @param opt 选项
 * @param obj 对象
 */
export const getWikiLinter: getAsyncLinter<Promise<MixedDiagnostic[]>, Option, object> = async (opt, obj) => {
	await getWikiparse(
		opt?.['getConfig'] as (() => Promise<ConfigData>) | undefined,
		opt?.['i18n'] as string | string[] | undefined,
	);
	const lsp = getLSP(obj!, opt?.['include'] as boolean | undefined)!,
		cssLint = await getCssLinter();
	const linter: asyncLinter<Promise<MixedDiagnostic[]>> = async (text, config) => {
		const defaultSeverity = config?.['defaultSeverity'] as string | number | undefined ?? 2,
			diagnostics = (await lsp.provideDiagnostics(text)).filter(
				({code, severity}) => Number(config?.[code!] ?? defaultSeverity) > Number(severity === 2),
			),
			tokens = 'findStyleTokens' in lsp && config?.['invalid-css'] !== '0' ? await lsp.findStyleTokens() : [];
		if (tokens.length === 0) {
			return diagnostics;
		}
		const lines = tokens.map((token, i) => `${getPrefix(token, i)}${
				sanitizeInlineStyle(token.childNodes![1]!.childNodes![0]!.data!)
					.replace(/\n/gu, ' ')
			}\n}`),
			cssConfig = config?.['css'] as Config | Config['rules'] | undefined,
			isConfig = isStylelintConfig(cssConfig),
			rules: Config['rules'] = {};
		for (const [key, value] of Object.entries((isConfig ? cssConfig.rules : cssConfig) ?? {})) {
			if (!value) {
				rules[key] = value;
			}
		}
		return [
			...diagnostics,
			...(await cssLint(lines.join('\n'), isConfig ? {...cssConfig, rules} : rules))
				.map(({line, column, endLine, endColumn, rule, severity, text: message, fix}): MixedDiagnostic => {
					const i = Math.ceil(line / 3),
						{length} = getPrefix(tokens[i - 1]!, i),
						{range} = tokens[i - 1]!.childNodes![1]!.childNodes![0]!,
						from = offsetAt(range, line - 3 * i, column - 1),
						diagnostic: MixedDiagnostic = {
							from,
							to: endLine === undefined ? from : offsetAt(range, endLine - 3 * i, endColumn! - 1),
							severity: severity === 'error' ? 1 : 2,
							source: 'Stylelint',
							code: rule,
							message,
						};
					if (fix) {
						const before = lines.slice(0, i - 1).join('\n').length + 1 + length;
						diagnostic.data = [
							{
								range: {
									start: indexToPos(text, offsetAt(range, fix.range[0] - before)),
									end: indexToPos(text, offsetAt(range, fix.range[1] - before)),
								},
								newText: fix.text,
								title: 'Fix: Stylelint',
								fix: true,
							} satisfies QuickFixData,
						];
					}
					return diagnostic;
				}),
		];
	};
	if ('resolveCodeAction' in lsp) {
		linter.fixer = async (_, rule): Promise<string> =>
			(await lsp.resolveCodeAction(rule)).edit!.changes!['']![0]!.newText;
	}
	return linter;
};

export const jsConfig = /* #__PURE__ */ ((): Linter.Config => ({
	env: {browser: true, es2024: true, jquery: true},
	globals: {
		mw: 'readonly',
		mediaWiki: 'readonly',
		OO: 'readonly',
		addOnloadHook: 'readonly',
		importScriptURI: 'readonly',
		importScript: 'readonly',
		importStylesheet: 'readonly',
		importStylesheetURI: 'readonly',
	},
}))();

/**
 * 获取 ESLint
 * @param cdn CDN 地址
 */
export const getJsLinter: getAsyncLinter<Linter.LintMessage[], string> = async (
	cdn = 'npm/@bhsd/eslint-browserify',
) => {
	await loadScript(cdn, 'eslint');
	/** @see https://www.npmjs.com/package/@codemirror/lang-javascript */
	const esLinter = new eslint.Linter(),
		conf: Linter.Config = {
			env: {browser: true, es2024: true},
			parserOptions: {ecmaVersion: 15, sourceType: 'module'},
		},
		recommended: Linter.RulesRecord = {};
	for (const [name, {meta}] of esLinter.getRules()) {
		if (meta?.docs?.recommended) {
			recommended[name] = 2;
		}
	}
	const linter: asyncLinter<Linter.LintMessage[], Linter.Config> = (text, opt: Linter.Config | null | undefined) => {
		const config: Linter.Config = {...conf, ...opt};
		if (
			!('rules' in config)
			|| config.extends === 'eslint:recommended'
			|| Array.isArray(config.extends) && config.extends.includes('eslint:recommended')
		) {
			config.rules = {...recommended, ...config.rules};
		}
		delete config.extends;
		linter.config = config as Record<string, unknown>;
		return esLinter.verify(text, config);
	};
	linter.fixer = (code, rule): string => esLinter.verifyAndFix(
		code,
		rule ? {...linter.config, rules: {[rule]: linter.config!.rules?.[rule] ?? 2}} : linter.config!,
	).output;
	return linter as asyncLinter<Linter.LintMessage[]>;
};

/**
 * 获取 Stylelint
 * @param cdn CDN 地址
 */
export const getCssLinter: getAsyncLinter<Promise<Warning[]>, string> = async (
	cdn = 'npm/@bhsd/stylelint-browserify',
) => {
	await loadScript(cdn, 'stylelint');
	const linter: asyncLinter<Promise<Warning[]>, Config> = async (code, opt) => {
		const warnings = await styleLint(stylelint, code, opt);
		linter.config = opt && !isStylelintConfig(opt) ? {rules: opt} : opt!;
		return warnings;
	};
	linter.fixer = (code, rule): Promise<string> => {
		if (!linter.config) {
			throw new Error('Fixer unavailable!');
		}
		return styleLint(
			stylelint,
			code,
			rule ? {extends: [], rules: {[rule]: linter.config.rules?.[rule] ?? true}} : linter.config,
			true,
		);
	};
	return linter;
};

/**
 * 获取 Luacheck
 * @param cdn CDN 地址
 */
export const getLuaLinter: getAsyncLinter<Promise<Diagnostic[]>, string> = async (
	cdn = 'npm/luacheck-browserify',
) => {
	await loadScript(cdn, 'luacheck');
	// eslint-disable-next-line @typescript-eslint/await-thenable
	const luachecker = await luacheck(undefined as unknown as string);
	return async text => (await luachecker.queue(text)).filter(({severity}) => severity);
};

/** JSON.parse */
export const getJsonLinter: getLinter<JsonError[]> = () => str => {
	try {
		if (str.trim()) {
			JSON.parse(str);
		}
	} catch (e) {
		if (e instanceof SyntaxError) {
			const {message} = e,
				line = /\bline (\d+)/u.exec(message)?.[1],
				column = /\bcolumn (\d+)/u.exec(message)?.[1],
				position = /\bposition (\d+)/u.exec(message)?.[1];
			return [
				{
					message,
					severity: 'error',
					line,
					column,
					position,
				},
			];
		}
	}
	return [];
};
