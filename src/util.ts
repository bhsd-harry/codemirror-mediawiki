import elt from 'crelt';
import {tokens} from './config.js';
import {
	hoverSelector,
	doctagMark,
	typeMark,
} from './constants.js';
import type {
	EditorView,
	TooltipView,
	Decoration,
} from '@codemirror/view';
import type {
	Text,
	EditorState,
	SelectionRange,
	Range,
} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';
import type {Position} from 'vscode-languageserver-types';
import type {ConfigGetter} from '@bhsd/browser';
import type {ConfigData} from 'wikiparser-node';

const dict: Record<string, string> = {'\n': '<br>', '&': '&amp;', '<': '&lt;'};

/**
 * 转义HTML字符串
 * @param text 原字符串
 * @test
 */
export const escHTML = (text: string): string => text.replace(/[\n<&]/gu, ch => dict[ch]!);

/**
 * 将索引转换为位置
 * @param doc Text 实例
 * @param index 索引
 * @test
 */
export const indexToPos = (doc: Text, index: number): Position => {
	const line = doc.lineAt(index);
	return {line: line.number - 1, character: index - line.from};
};

/**
 * 将位置转换为索引
 * @param doc Text 实例
 * @param pos 位置
 * @test
 */
export const posToIndex = (doc: Text, pos: Position): number => {
	const line = doc.line(pos.line + 1);
	return Math.min(line.from + pos.character, line.to);
};

/**
 * 创建 TooltipView
 * @param view EditorView 实例
 * @param innerHTML 提示内容
 */
export const createTooltipView = (view: EditorView, innerHTML: string): TooltipView => {
	const inner = elt('div'),
		dom = elt('div', {class: hoverSelector.slice(1)}, inner);
	dom.style.font = getComputedStyle(view.contentDOM).font;
	inner.innerHTML = innerHTML;
	return {dom};
};

/**
 * 获取节点对应的字符串
 * @param state EditorState 实例
 * @param node 语法树节点
 * @test
 */
export const sliceDoc = (state: EditorState, node: SyntaxNode | SelectionRange): string =>
	state.sliceDoc(node.from, node.to);

/**
 * Update the stack of opening (+) or closing (-) braces
 * @param state
 * @param node 语法树节点
 * @test
 */
export const braceStackUpdate = (state: EditorState, node: SyntaxNode): [number, number] => {
	const brackets = sliceDoc(state, node);
	return [brackets.split('{{').length - 1, 1 - brackets.split('}}').length];
};

/**
 * Mark the type in a JSDoc/LDoc comment
 * @param decorations
 * @param from 起始位置
 * @param mt 正则表达式匹配结果，第1个捕获组为标签，第2个捕获组为类型的起始括号`{`
 * @test
 */
export const markDocTagType = (
	decorations: Range<Decoration>[],
	from: number,
	mt: RegExpExecArray,
): Range<Decoration>[] => {
	const {input, indices} = mt,
		[start, end] = indices![1]!;
	decorations.push(doctagMark.range(from + start, from + end));
	if (mt[2]) {
		const re = /[{}]/gu,
			[, left] = indices![2]!;
		re.lastIndex = left;
		let m = re.exec(input),
			balance = 1;
		while (m) {
			balance += m[0] === '{' ? 1 : -1;
			if (balance === 0) {
				const {index} = m;
				if (index > left) {
					decorations.push(typeMark.range(from + left, from + index));
				}
				break;
			}
			m = re.exec(input);
		}
	}
	return decorations;
};

/**
 * Check if the node is a template parameter value
 * @param node 语法树节点
 */
export const isTemplate = (node: SyntaxNode): boolean => node.name.split('_').includes(tokens.template);

/**
 * Find the current template name and parameter name
 * @param state
 * @param node 语法树节点
 * @test
 */
export const findTemplateName = (state: EditorState, node: SyntaxNode): [string | null, string] => {
	let stack = -1,
		{prevSibling} = node,
		/** 可包含`_`、`:`等 */ page = '',
		parameter = '',
		need = isTemplate(node);
	while (prevSibling) {
		const {name} = prevSibling;
		if (name.includes(tokens.templateBracket)) {
			if (need && parameter) {
				need = false;
				parameter = '';
			}
			const [lbrace, rbrace] = braceStackUpdate(state, prevSibling);
			stack += lbrace;
			if (stack >= 0) {
				break;
			}
			stack += rbrace;
		} else if (stack === -1) {
			if (name.includes(tokens.templateName)) {
				page = sliceDoc(state, prevSibling) + page;
			} else if (need) {
				if (name.includes(tokens.templateDelimiter)) {
					need = false;
				} else if (name.includes(tokens.templateArgumentName)) {
					parameter = sliceDoc(state, prevSibling) + parameter;
				} else if (parameter && !name.includes(tokens.comment)) {
					need = false;
					parameter = '';
				}
			}
		} else if (page && !name.includes(tokens.comment)) {
			prevSibling = null;
			break;
		}
		({prevSibling} = prevSibling);
	}
	return [prevSibling && page, parameter];
};

export const toConfigGetter = (
	configGetter?: ConfigGetter,
	articlePath?: string,
): ConfigGetter | undefined => articlePath
	? async (): Promise<ConfigData> => Object.assign(await (configGetter ?? wikiparse.getConfig)(), {articlePath})
	: configGetter;

/**
 * 获取字符串开头的空白字符
 * @param str 字符串
 * @test
 */
export const leadingSpaces = (str: string): string => /^\s*/u.exec(str)![0];
