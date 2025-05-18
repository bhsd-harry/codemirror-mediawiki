import {loadScript, getLSP, sanitizeInlineStyle} from '@bhsd/common';
import {styleLint} from '@bhsd/common/dist/stylelint';
import type {Diagnostic as DiagnosticBase, Range} from 'vscode-languageserver-types';
import type {Linter} from 'eslint';
import type {Warning, Severity} from 'stylelint';
import type {Diagnostic} from 'luacheck-browserify';

export type Option = Record<string, unknown> | null | undefined;
export type LiveOption = (runtime?: true) => Option;
declare type getLinter<T> = () => (text: string) => T;

/**
 * @param opt 初始化选项
 * @param obj 仅用于wikiparse.LanguageService
 * @param config runtime设置
 */
declare type getAsyncLinter<T, S = never, R = never> =
	(opt?: S, obj?: R) => Promise<(text: string, config?: Option) => T>;
declare interface MixedDiagnostic extends Omit<DiagnosticBase, 'range'> {
	range?: Range;
	from?: number;
	to?: number;
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
	const DIR = 'npm/wikiparser-node/extensions/dist',
		lang = opt?.['i18n'];
	await loadScript(`${DIR}/base.min.js`, 'wikiparse');
	await loadScript(`${DIR}/lsp.min.js`, 'wikiparse.LanguageService');
	if (typeof lang === 'string') {
		try {
			const i18n: Record<string, string> =
				await (await fetch(`${wikiparse.CDN}/i18n/${lang.toLowerCase()}.json`)).json();
			wikiparse.setI18N(i18n);
		} catch {}
	}
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

/**
 * 获取 ESLint
 * @param fixAll 是否修正
 */
export const getJsLinter: getAsyncLinter<Linter.LintMessage[], boolean> = async (fixAll?: boolean) => {
	await loadScript('npm/eslint-linter-browserify@8.57.0/linter.min.js', 'eslint', true);
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
	return (text, opt: Linter.Config | null | undefined) => {
		const config: Linter.Config = {...conf, ...opt};
		if (
			!('rules' in config)
			|| config.extends === 'eslint:recommended'
			|| Array.isArray(config.extends) && config.extends.includes('eslint:recommended')
		) {
			config.rules = {...recommended, ...config.rules};
		}
		delete config.extends;
		const warnings = esLinter.verify(text, config);
		if (fixAll && warnings.some(({fix, suggestions}) => fix || suggestions?.length)) {
			const {fixed, output} = esLinter.verifyAndFix(text, config);
			if (fixed) {
				warnings.push({
					line: 1,
					column: 1,
					ruleId: null,
					severity: 0,
					message: output,
				});
			}
		}
		return warnings;
	};
};

/**
 * 获取 Stylelint
 * @param fixAll 是否修正
 */
export const getCssLinter: getAsyncLinter<Promise<Warning[]>, boolean> = async (fixAll?: boolean) => {
	await loadScript('npm/@bhsd/stylelint-browserify', 'stylelint');
	return async (code, opt) => {
		const warnings = await styleLint(stylelint, code, opt);
		if (fixAll && warnings.some(({fix}) => fix)) {
			const text = await styleLint(stylelint, code, opt, true);
			if (text !== code) {
				warnings.push({
					line: 1,
					column: 1,
					rule: 'fix',
					severity: 'custom' as Severity,
					text,
				});
			}
		}
		return warnings;
	};
};

/** 获取 Luacheck */
export const getLuaLinter: getAsyncLinter<Promise<Diagnostic[]>> = async () => {
	await loadScript('npm/luacheck-browserify/dist/index.min.js', 'luacheck');
	// eslint-disable-next-line @typescript-eslint/await-thenable
	const luachecker = await luacheck(undefined as unknown as string);
	return async text => (await luachecker.queue(text)).filter(({severity}) => severity);
};

declare interface JsonError {
	message: string;
	severity: 'error';
	line: string | undefined;
	column: string | undefined;
	position: string | undefined;
}

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
