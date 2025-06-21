/* eslint-disable unicorn/no-unreadable-iife */
import {loadScript, getWikiparse, getLSP, sanitizeInlineStyle} from '@bhsd/common';
import {styleLint} from '@bhsd/common/dist/stylelint';
import type {Diagnostic as DiagnosticBase, Range} from 'vscode-languageserver-types';
import type {Linter} from 'eslint';
import type {Warning, Config} from 'stylelint';
import type {Diagnostic} from 'luacheck-browserify';
import type {ConfigData} from 'wikiparser-node';

export type Option = Record<string, unknown> | null | undefined;
export type LiveOption = (runtime?: boolean) => Option;
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
 * @param line 行号
 * @param column 列号
 */
const offsetAt = (range: [number, number], line: number, column: number): number => {
	if (line === -2) {
		return range[0];
	}
	return line === 0 ? range[1] : range[0] + column;
};

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
	const lsp = getLSP(obj!, opt?.['include'] as boolean | undefined)!;
	return async (text, config) => {
		const diagnostics = (await lsp.provideDiagnostics(text)).filter(
				({code, severity}) => Number(config?.[code!] ?? 2) > Number(severity === 2),
			),
			tokens = 'findStyleTokens' in lsp && config?.['invalid-css'] !== '0' ? await lsp.findStyleTokens() : [];
		if (tokens.length === 0) {
			return diagnostics;
		}
		const cssLint = await getCssLinter();
		return [
			...diagnostics,
			...(await cssLint(
				tokens.map(({childNodes, type, tag}, i) => `${type === 'ext-attr' ? 'div' : tag as string}#${i}{\n${
					sanitizeInlineStyle(childNodes![1]!.childNodes![0]!.data!)
						.replace(/\n/gu, ' ')
				}\n}`).join('\n'),
			)).map(({line, column, endLine, endColumn, rule, severity, text: message}): MixedDiagnostic => {
				const i = Math.ceil(line / 3),
					{range} = tokens[i - 1]!.childNodes![1]!.childNodes![0]!,
					from = offsetAt(range, line - 3 * i, column - 1);
				return {
					from,
					to: endLine === undefined ? from : offsetAt(range, endLine - 3 * i, endColumn! - 1),
					severity: severity === 'error' ? 1 : 2,
					source: 'Stylelint',
					code: rule,
					message,
				};
			}),
		];
	};
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

/** 获取 ESLint */
export const getJsLinter: getAsyncLinter<Linter.LintMessage[]> = async () => {
	await loadScript('npm/@bhsd/eslint-browserify', 'eslint');
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

/** 获取 Stylelint */
export const getCssLinter: getAsyncLinter<Promise<Warning[]>> = async () => {
	await loadScript('npm/@bhsd/stylelint-browserify', 'stylelint');
	const linter: asyncLinter<Promise<Warning[]>, Config> = async (code, opt) => {
		const warnings = await styleLint(stylelint, code, opt);
		if (opt && 'rules' in opt) {
			linter.config = opt;
		}
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

/** 获取 Luacheck */
export const getLuaLinter: getAsyncLinter<Promise<Diagnostic[]>> = async () => {
	await loadScript('npm/luacheck-browserify', 'luacheck');
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
