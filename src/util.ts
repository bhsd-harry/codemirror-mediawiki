import {syntaxHighlighting, HighlightStyle} from '@codemirror/language';
import {
	isGlobal,
	loadScript,
} from '@bhsd/browser';
import {numLeadingSpaces} from '@bhsd/common';
import {tokens} from './config.js';
import {
	baseData,
	mwTag,
	doctagMark,
	typeMark,
} from './constants.js';
import type {Decoration} from '@codemirror/view';
import type {
	Text,
	EditorState,
	Range,
	Extension,
} from '@codemirror/state';
import type {StringStream} from '@codemirror/language';
import type {Completion} from '@codemirror/autocomplete';
import type {SyntaxNode} from '@lezer/common';
import type {Position} from 'vscode-languageserver-types';
import type {ConfigGetter} from '@bhsd/browser';
import type {ConfigData} from 'wikiparser-node';

export interface DocRange {
	from: number;
	to: number;
}

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
 * 获取节点对应的字符串
 * @param state EditorState 实例
 * @param node 语法树节点
 * @test
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

export const toConfigGetter = (
	configGetter?: ConfigGetter,
	articlePath?: string,
): ConfigGetter | undefined => articlePath
	? async (): Promise<ConfigData> => Object.assign(await (configGetter ?? wikiparse.getConfig)(), {articlePath})
	: configGetter;

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
 * 获取字符串开头的空白字符
 * @param str 字符串
 * @test
 */
export const leadingSpaces = (str: string): string => str.slice(0, numLeadingSpaces(str));

/**
 * Mark the type in a JSDoc/LDoc comment
 * @param decorations
 * @param from 起始位置
 * @param mt 正则表达式匹配结果，第1个捕获组为标签，第2个捕获组为类型的起始括号`{`
 * @param offset Decoration 向外扩展的大小，默认为0
 * @test
 */
export const markDocTagType = (
	decorations: Range<Decoration>[],
	from: number,
	mt: RegExpExecArray,
	offset = 0,
): number => {
	const {input, indices} = mt,
		[start, end] = indices![1]!;
	pushDecoration(decorations, doctagMark, from + start, from + end);
	if (mt[2]) {
		const re = /[{}]/gu,
			[, left] = indices![2]!;
		re.lastIndex = left;
		let m = re.exec(input),
			balance = 1;
		while (m) {
			balance += m[0] === '{' ? 1 : -1;
			if (balance === 0) {
				pushDecoration(decorations, typeMark, from + left - offset, from + m.index + offset);
				return m.index + 1;
			}
			m = re.exec(input);
		}
	}
	return end;
};

/**
 * Check if the node is a template parameter value
 * @param node 语法树节点
 */
export const isTemplateParam = (node: SyntaxNode): boolean => node.name.split('_').includes(tokens.template);

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
		need = isTemplateParam(node);
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

/**
 * 获取子页面层级
 * @param str 子页面路径
 */
export const getSubpageLevel = (str: string): number => /^(?:\.\.\/)*/u.exec(str)![0].length;

/**
 * 把标题中的空格替换为下划线（如果需要）
 * @param title 页面标题
 * @param underscore 是否使用下划线替换空格
 */
export const useUnderscore = (title: string, underscore: boolean): string =>
	underscore ? title.replaceAll(' ', '_') : title;

/**
 * 生成语法高亮扩展
 * @param args 传递给 `HighlightStyle.define` 的参数
 */
export const getHighlightExtension = (...args: Parameters<(typeof HighlightStyle)['define']>): Extension =>
	syntaxHighlighting(HighlightStyle.define(...args));

/** 加载 marked 库 */
export const loadMarked = async (): Promise<void> => {
	const {CDN = ''} = baseData;
	await loadScript(`${CDN}${CDN && '/'}npm/marked/lib/marked.umd.js`, 'marked', true);
};
