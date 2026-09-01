import {
	keymap,
} from '@codemirror/view';
import {
	syntaxTree,
	foldGutter,
	foldKeymap,
} from '@codemirror/language';
import {tokens} from './config.js';
import {
	sliceDoc,
	getFoldService,
} from './util.js';
import type {
	EditorState,
	Extension,
} from '@codemirror/state';
import type {DocRange} from './util';

/** @returns 折叠范围或是否继续查找 */
declare type FoldableLineEndCheck = (from: number, to?: number) => DocRange | boolean;

/**
 * 寻找可折叠的行范围
 * @ignore
 */
export const myService = (state: EditorState, f: number, t: number): DocRange | null => {
	const tree = syntaxTree(state),
		{doc} = state,
		{length, lines} = doc;

	/**
	 * 获取标题层级
	 * @param pos 行首位置
	 */
	const getLevel = (pos: number): number => {
			const {name} = tree.resolve(pos, 1);
			return name.includes(tokens.sectionHeader) ? Number(/mw-section--(\d)/u.exec(name)![1]) : 7;
		},

		/**
		 * 获取表格语法
		 * @param from 行首位置
		 * @param to 行尾位置
		 */
		getTable = (from: number, to: number): 0 | 1 | -1 => {
			const node = tree.resolve(from, 1),
				{nextSibling} = node,
				bracket = node.name.includes(tokens.tableBracket)
					? node
					: node.to < to && nextSibling?.name.includes(tokens.tableBracket) && nextSibling;
			if (bracket) {
				return /\|\}$|\{\{\s*!(?:\s*\}|\)\s*)\}\}$/u.test(sliceDoc(state, bracket)) ? -1 : 1;
			}
			return 0;
		},

		/**
		 * 逐行检查是否是折叠终点
		 * @param checkLine 检查函数
		 * @returns 折叠范围或是否继续查找
		 */
		loop = (checkLine: FoldableLineEndCheck): DocRange | true | null => {
			let i = 1;
			while (i <= lines) {
				const {from, to} = doc.line(i);
				if (from >= tree.topNode.to) {
					return from === length || null;
				} else if (from > f) {
					/** 折叠范围或是否继续查找 */
					const result = checkLine(from, to);
					if (result !== true) {
						return result || null;
					}
				}
				i++;
				if (i === length) {
					i = doc.lineAt(to).number + 1;
				}
			}
			return true;
		};

	const level = getLevel(f);
	if (level < 7) {
		const checkLine: FoldableLineEndCheck = from =>
			getLevel(from) > level || t < from - 1 && {from: t, to: from - 1};
		const /** 折叠范围或是否继续查找 */ result = loop(checkLine);
		if (result === true) {
			return t === length ? null : {from: t, to: length};
		}
		return result;
	} else if (getTable(f, t) === 1) {
		const checkLine: FoldableLineEndCheck = (from, to) => {
			const bracket = getTable(from, to!);
			return bracket === -1 ? t < from - 1 && {from: t, to: from - 1} : bracket !== 1 && getLevel(from) === 7;
		};
		const /** 折叠范围或是否继续查找 */ result = loop(checkLine);
		return typeof result === 'object' ? result : null;
	}
	return null;
};

const defaultFoldExtension = /* #__PURE__ */ (() => [foldGutter(), keymap.of(foldKeymap)])();

/**
 * Get the [codeFolding](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#codefolding)
 * extension for Wikitext.
 */
export default (
): Extension => [
	getFoldService(myService),
	defaultFoldExtension,
];
