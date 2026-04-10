import {sanitizeInlineStyle} from '@bhsd/common';
import {loadScript, getWikiparse, getLSP} from '@bhsd/browser';
import {styleLint} from '@bhsd/stylelint-util';
import {baseData} from './constants.js';
import type {Diagnostic as DiagnosticBase, Range, Position} from 'vscode-languageserver-types';
import type {
	Warning,
} from 'stylelint';
import type {ConfigGetter} from '@bhsd/browser';
import type {
	QuickFixData,
	AST,
	LintConfig,
} from 'wikiparser-node';

declare type asyncLinter<
	T,
> =
	(text: string, obj?: object) => T;

/**
 * @param opt 初始化选项
 */
declare type getAsyncLinter<
	T,
	S = never,
	R = never,
> = (
	opt?: S,
	obj?: R,
) => Promise<asyncLinter<T>>;
declare interface MixedDiagnostic extends Omit<DiagnosticBase, 'range'> {
	range?: Range;
	from?: number;
	to?: number;
}

export const stylelintRepo = 'npm/@bhsd/stylelint-browserify';

/**
 * 计算位置
 * @param range 范围
 * @param lineOrOffset 行号或相对位置
 * @param column 列号
 */
export const offsetAt = (range: [number, number], lineOrOffset: number, column?: number): number => {
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
export const getPrefix = ({type, tag}: AST, i: number): string =>
	`${type === 'ext-attr' ? 'div' : tag as string}#${i}{\n`;

/**
 * 将偏移量转换为位置
 * @param code 代码字符串
 * @param index 偏移量
 */
export const indexToPos = (code: string, index: number): Position => {
	const lines = code.slice(0, index).split('\n');
	return {line: lines.length - 1, character: lines[lines.length - 1]!.length};
};

/**
 * 获取 Wikitext LSP
 * @param opt 选项
 * @param obj 对象
 */
export const getWikiLinter: getAsyncLinter<
	Promise<MixedDiagnostic[]>,
	ConfigGetter,
	LintConfig
> = async (opt, obj) => {
	const cdn = baseData.CDN;
	await getWikiparse(
		opt,
		undefined,
		cdn,
	);
	const isFull = obj && 'rules' in obj,
		cssConfig = isFull ? obj.rules['invalid-css'] : obj?.['invalid-css'],
		isWarning = cssConfig === 1 || cssConfig === 'warning';
	if (isFull) {
		delete obj.rules['invalid-css'];
	} else if (obj) {
		delete obj['invalid-css'];
	}
	wikiparse.setLintConfig(obj);
	const cssLint =
		cssConfig === 0 || cssConfig === false || cssConfig === 'off'
			? (): never[] => [] : // eslint-disable-line @stylistic/operator-linebreak
			await getCssLinter(cdn && `${cdn}/${stylelintRepo}`);
	const linter: asyncLinter<Promise<MixedDiagnostic[]>> = async (
		text,
		view,
	) => {
		const lsp = getLSP(view!, true)!,
			diagnostics = await lsp.provideDiagnostics(text),
			tokens = 'findStyleTokens' in lsp
				? await lsp.findStyleTokens()
				: [];
		if (tokens.length === 0) {
			return diagnostics;
		}
		const lines = tokens.map((token, i) => `${getPrefix(token, i)}${
			sanitizeInlineStyle(token.childNodes![1]!.childNodes![0]!.data!)
				.replaceAll('\n', ' ')
		}\n}`);
		return [
			...diagnostics,
			...(await cssLint(
				lines.join('\n'),
			)).map(({line, column, endLine, endColumn, rule, severity, text: message, fix}): MixedDiagnostic => {
				const i = Math.ceil(line / 3),
					{range} = tokens[i - 1]!.childNodes![1]!.childNodes![0]!,
					from = offsetAt(range, line - 3 * i, column - 1),
					diagnostic: MixedDiagnostic = {
						from,
						to: endLine === undefined ? from : offsetAt(range, endLine - 3 * i, endColumn! - 1),
						severity: severity === 'error'
							&& !isWarning
							? 1
							: 2,
						source: 'Stylelint',
						code: rule,
						message,
					};
				if (fix) {
					const {length} = getPrefix(tokens[i - 1]!, i),
						before = lines.slice(0, i - 1).join('\n').length + length + (i - 1 && 1);
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
	return linter;
};

/**
 * 获取 Stylelint
 * @param cdn CDN 地址
 */
export const getCssLinter: getAsyncLinter<Promise<Warning[]>, string> = async (cdn = stylelintRepo) => {
	await loadScript(cdn, 'stylelint');
	const linter: asyncLinter<
		Promise<Warning[]>
	> = async code => {
		const warnings = await styleLint(stylelint, code);
		return warnings;
	};
	return linter;
};
