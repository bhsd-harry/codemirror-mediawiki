import elt from 'crelt';
import {tokens} from './config.js';
import {
	hoverSelector,
} from './constants.js';
import type {EditorView, TooltipView} from '@codemirror/view';
import type {Text, EditorState, SelectionRange} from '@codemirror/state';
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
 * Update the stack of opening (+) or closing (-) brackets
 * @param state
 * @param node 语法树节点
 * @test
 */
export const braceStackUpdate = (state: EditorState, node: SyntaxNode): [number, number] => {
	const brackets = sliceDoc(state, node);
	return [brackets.split('{{').length - 1, 1 - brackets.split('}}').length];
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
