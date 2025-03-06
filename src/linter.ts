import {CDN, loadScript, getLSP, sanitizeInlineStyle} from '@bhsd/common';
import {styleLint} from '@bhsd/common/dist/stylelint';
import type {Diagnostic as DiagnosticBase, Range} from 'vscode-languageserver-types';
import type {Linter} from 'eslint';
import type {Warning} from 'stylelint';
import type {Diagnostic} from 'luacheck-browserify';

declare type getLinter<T> = () => T;
declare type getAsyncLinter<T> = (opt?: Record<string, unknown> | null, obj?: object) => Promise<T>;
declare interface MixedDiagnostic extends Omit<DiagnosticBase, 'range'> {
	range?: Range;
	from?: number;
	to?: number;
}

/**
 * 计算位置
 * @param maxOffset 最大偏移量
 * @param lines 各行文本
 * @param line 行号
 * @param column 列号
 */
const offsetAt = (maxOffset: number, lines: string[], line: number, column: number): number => {
	if (line === 1) {
		return 0;
	}
	return line === lines.length + 2
		? maxOffset
		: lines.slice(0, line - 2).join('\n').length + column - 1;
};

/**
 * 获取 Wikitext LSP
 * @param opt 选项
 * @param obj 对象
 */
export const getWikiLinter: getAsyncLinter<(text: string) => Promise<MixedDiagnostic[]>> = async (opt, obj) => {
	const REPO = 'npm/wikiparser-node',
		DIR = `${REPO}/extensions/dist`,
		lang = opt?.['i18n'];
	await loadScript(`${DIR}/base.min.js`, 'wikiparse');
	await loadScript(`${DIR}/lint.min.js`, 'wikiparse.Linter');
	if (typeof lang === 'string') {
		try {
			const i18n: Record<string, string> =
				await (await fetch(`${CDN}/${REPO}/i18n/${lang.toLowerCase()}.json`)).json();
			wikiparse.setI18N(i18n);
		} catch {}
	}
	const lsp = getLSP(obj!)!;
	return async text => {
		const latest = 'findStyleTokens' in lsp,
			diagnostics = await lsp.provideDiagnostics(text),
			tokens = latest ? await lsp.findStyleTokens() : [];
		if (!latest) {
			return diagnostics;
		}
		const cssLint = await getCssLinter();
		return [
			diagnostics,
			await Promise.all(tokens.map(async ({childNodes, type, tag}) => {
				const {range: [offset], data} = childNodes![1]!.childNodes![0]!,
					l = data!.length,
					lines = data!.split('\n');
				return (await cssLint(
					`${type === 'ext-attr' ? 'div' : tag as string}{\n${sanitizeInlineStyle(data!)}\n}`,
				)).map(({line, column, endLine, endColumn, rule, severity, text: message}): MixedDiagnostic => {
					const from = offsetAt(l, lines, line, column) + offset;
					return {
						from,
						to: endLine === undefined ? from : offsetAt(l, lines, endLine, endColumn!) + offset,
						severity: severity === 'error' ? 1 : 2,
						source: 'Stylelint',
						code: rule,
						message,
					};
				});
			})),
		].flat(2);
	};
};

/**
 * 获取 ESLint
 * @param opt 选项
 */
export const getJsLinter: getAsyncLinter<(text: string) => Linter.LintMessage[]> = async opt => {
	await loadScript('npm/eslint-linter-browserify@8.57.0/linter.min.js', 'eslint', true);
	/** @see https://www.npmjs.com/package/@codemirror/lang-javascript */
	const esLinter = new eslint.Linter(),
		conf: Linter.Config = {
			env: {browser: true, es2024: true},
			parserOptions: {ecmaVersion: 15, sourceType: 'module'},
			rules: {},
			...opt,
		};
	for (const [name, {meta}] of esLinter.getRules()) {
		if (meta?.docs?.recommended) {
			conf.rules![name] ??= 2;
		}
	}
	return text => esLinter.verify(text, conf);
};

/**
 * 获取 Stylelint
 * @param opt 选项
 */
export const getCssLinter: getAsyncLinter<(text: string) => Promise<Warning[]>> = async opt => {
	await loadScript('npm/stylelint-bundle', 'stylelint');
	return code => styleLint(stylelint, code, opt?.['rules'] as Record<string, unknown> | undefined);
};

/** 获取 Luacheck */
export const getLuaLinter: getAsyncLinter<(text: string) => Promise<Diagnostic[]>> = async () => {
	await loadScript('npm/luacheck-browserify/dist/index.min.js', 'luacheck');
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
export const getJsonLinter: getLinter<(text: string) => JsonError[]> = () => str => {
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
