import elt from 'crelt';
import {
	hoverSelector,
	base,
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
 * 将解析设置转换为返回Promise的函数
 * @param configData 解析设置
 */
export const toConfigGetter = (
	configData: ConfigData,
): ConfigGetter => () => Promise.resolve(configData);

/**
 * 更新 CDN 地址
 * @param cdn jsDelivr CDN
 */
export const updateCDN = (cdn?: string): void => {
	if (cdn) {
		base.CDN = cdn;
	}
};
