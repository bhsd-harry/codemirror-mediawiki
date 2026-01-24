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
import type {TagName} from './config';

const dict: Record<string, string> = {'\n': '<br>', '&': '&amp;', '<': '&lt;'};

/**
 * 转义HTML字符串
 * @param text 原字符串
 */
export const escHTML = (text: string): string => text.replace(/[\n<&]/gu, ch => dict[ch]!);

/**
 * 将索引转换为位置
 * @param doc Text 实例
 * @param index 索引
 */
export const indexToPos = (doc: Text, index: number): Position => {
	const line = doc.lineAt(index);
	return {line: line.number - 1, character: index - line.from};
};

/**
 * 将位置转换为索引
 * @param doc Text 实例
 * @param pos 位置
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
 */
export const sliceDoc = (state: EditorState, node: SyntaxNode | SelectionRange): string =>
	state.sliceDoc(node.from, node.to);

/**
 * Update the stack of opening (+) or closing (-) brackets
 * @param state
 * @param node 语法树节点
 */
export const braceStackUpdate = (state: EditorState, node: SyntaxNode): [number, number] => {
	const brackets = sliceDoc(state, node);
	return [brackets.split('{{').length - 1, 1 - brackets.split('}}').length];
};

/**
 * Find the current template name
 * @param state
 * @param node 语法树节点
 */
export const findTemplateName = (state: EditorState, node: SyntaxNode): string | null => {
	let stack = -1,
		{prevSibling} = node,
		/** 可包含`_`、`:`等 */ page = '';
	while (prevSibling) {
		const {name} = prevSibling;
		if (name.includes(tokens.templateBracket)) {
			const [lbrace, rbrace] = braceStackUpdate(state, prevSibling);
			stack += lbrace;
			if (stack >= 0) {
				break;
			}
			stack += rbrace;
		} else if (stack === -1 && name.includes(tokens.templateName)) {
			page = sliceDoc(state, prevSibling) + page;
		} else if (page && !name.includes(tokens.comment)) {
			prevSibling = null;
			break;
		}
		({prevSibling} = prevSibling);
	}
	return prevSibling && page;
};

/**
 * 判断节点是否包含指定类型
 * @param types 节点类型
 * @param names 指定类型
 */
export const hasTag = (types: Set<string>, names: TagName | TagName[]): boolean =>
	(Array.isArray(names) ? names : [names]).some(name => types.has(name in tokens ? tokens[name] : name));

export const toConfigGetter = (
	configGetter?: ConfigGetter,
	articlePath?: string,
): ConfigGetter | undefined => articlePath
	? async (): Promise<ConfigData> => Object.assign(await (configGetter ?? wikiparse.getConfig)(), {articlePath})
	: configGetter;

/**
 * 获取字符串开头的空白字符
 * @param str 字符串
 */
export const leadingSpaces = (str: string): string => /^\s*/u.exec(str)![0];
