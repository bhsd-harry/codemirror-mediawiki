import {
	isGlobal,
} from '@bhsd/browser';
import {
	baseData,
	mwTag,
} from './constants.js';
import type {Decoration} from '@codemirror/view';
import type {
	Text,
	EditorState,
	Range,
} from '@codemirror/state';
import type {StringStream} from '@codemirror/language';
import type {Completion} from '@codemirror/autocomplete';
import type {Position} from 'vscode-languageserver-types';
import type {ConfigGetter} from '@bhsd/browser';
import type {ConfigData} from 'wikiparser-node';

export interface DocRange {
	from: number;
	to: number;
}

/**
 * 更新 CDN 地址
 * @param cdn jsDelivr CDN
 */
export const updateCDN = (cdn?: string): void => {
	if (cdn) {
		baseData.CDN = cdn;
	}
};

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
 * 获取节点对应的字符串
 * @param state EditorState 实例
 * @param node 语法树节点
 */
export const sliceDoc = (state: EditorState, node: DocRange): string =>
	state.sliceDoc(node.from, node.to);

/**
 * Push a decoration to the array if the range is not empty
 * @param decorations Decoration 数组
 * @param decoration Decoration 实例
 * @param from 起始位置或节点
 * @param to 结束位置
 */
export const pushDecoration = (
	decorations: Range<Decoration>[],
	decoration: Decoration,
	from: number | DocRange,
	to?: number,
): void => {
	if (typeof from !== 'number') {
		({from, to} = from);
	}
	if (from < to!) {
		decorations.push(decoration.range(from, to));
	}
};

/**
 * 将解析设置转换为返回Promise的函数
 * @param configData 解析设置
 */
export const toConfigGetter = (
	configData: ConfigData,
): ConfigGetter => () => Promise.resolve(configData);

/**
 * Tokenizer for multiline comments
 * @param parent 外层 Tokenizer
 * @param end 注释结束标志
 */
export const inComment = <T extends {tokenize(stream: StringStream, state: T): string}>(
	parent: (stream: StringStream, state: T) => string,
	end: string,
): (stream: StringStream, state: T) => string => (stream, state) => {
	if (stream.skipTo(end)) {
		stream.next();
		stream.next();
		state.tokenize = parent;
	} else {
		stream.skipToEnd();
	}
	return 'comment';
};

/**
 * 生成自动补全选项
 * @param labels 选项标签列表
 * @param type 选项类型
 */
export const getCompletions = (labels: string[], type = 'keyword'): Completion[] =>
	labels.map((label): Completion => ({label, type}));

/**
 * 从Token类型中获取扩展标签名
 * @param types Token类型列表
 */
export const getExtTags = (types: string[]): string[] =>
	types.filter(type => type.startsWith(mwTag)).map(type => type.slice(7));

/** 检测 wikiparse 是否可用 */
export const isWikiparseLoaded = (): boolean => typeof wikiparse === 'object' && isGlobal('wikiparse');
