import {Decoration, EditorView} from '@codemirror/view';
import {StateField} from '@codemirror/state';
import {ensureSyntaxTree} from '@codemirror/language';
import modeConfig from './config';
import type {DecorationSet} from '@codemirror/view';
import type {EditorState, Range} from '@codemirror/state';
import type {MatchResult} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';

declare type TagType = 'ext' | 'html';
declare interface TagMatchResult extends MatchResult {
	start: Tag;
	end?: Tag;
}

class Tag {
	declare readonly type;
	declare readonly name;
	declare readonly first;
	declare readonly last;

	get closing(): boolean {
		return isClosing(this.first, this.type);
	}

	get selfClosing(): boolean {
		return modeConfig.voidHtmlTags.includes(this.name)
			|| this.type === 'ext' && isClosing(this.last, this.type);
	}

	get from(): number {
		return this.first.from;
	}

	get to(): number {
		return this.last.to;
	}

	constructor(type: TagType, name: string, first: SyntaxNode, last: SyntaxNode) {
		this.type = type;
		this.name = name;
		this.first = first;
		this.last = last;
	}
}

const isTag = ({name}: SyntaxNode): boolean => /-(?:ext|html)tag-(?!bracket)/u.test(name),
	isTagComponent = (s: string) => ({name}: SyntaxNode, type: TagType): boolean =>
		new RegExp(`-${type}tag-${s}`, 'u').test(name),
	isBracket = isTagComponent('bracket'),
	isName = isTagComponent('name'),
	isClosing = (node: SyntaxNode, type: TagType): boolean => isBracket(node, type) && node.to - node.from > 1,
	isNested = ({name}: SyntaxNode, type: TagType, tag: string): boolean =>
		type === 'ext' && new RegExp(`-tag-${tag}(?![a-z])`, 'u').test(name),
	getName = (state: EditorState, {from, to}: SyntaxNode): string => state.sliceDoc(from, to).trim(),
	stackUpdate = ({closing}: Tag): 1 | -1 => closing ? -1 : 1;

/**
 * 获取标签信息
 * @param state
 * @param node 语法树节点
 */
const getTag = (state: EditorState, node: SyntaxNode): Tag => {
	const type = node.name.includes('exttag') ? 'ext' : 'html';
	let {prevSibling} = node,
		nextSibling = node,
		nameNode = isName(node, type) ? node : null;
	while (nextSibling.nextSibling && !isBracket(nextSibling, type)) {
		({nextSibling} = nextSibling);
	}
	if (isBracket(nextSibling, type) && getName(state, nextSibling) === '<') {
		nextSibling = nextSibling.prevSibling!;
	}
	while (prevSibling && !isBracket(prevSibling, type)) {
		nameNode ||= isName(prevSibling, type) ? prevSibling : null;
		({prevSibling} = prevSibling);
	}
	const name = getName(state, nameNode!);
	return new Tag(type, name, prevSibling!, nextSibling);
};

/**
 * 搜索匹配的标签
 * @param state
 * @param origin 起始标签
 */
const searchTag = (state: EditorState, origin: Tag): Tag | null => {
	const {type, name, closing} = origin,
		siblingGetter = closing ? 'prevSibling' : 'nextSibling',
		endGetter = closing ? 'first' : 'last';
	let stack = closing ? -1 : 1,
		sibling = origin[endGetter][siblingGetter];
	while (sibling) {
		if (isName(sibling, type) && getName(state, sibling) === name && !isNested(sibling, type, name)) {
			const tag = getTag(state, sibling);
			stack += stackUpdate(tag);
			if (stack === 0) {
				return tag;
			}
			sibling = tag[endGetter];
		}
		sibling = sibling[siblingGetter];
	}
	return null;
};

/**
 * 匹配标签
 * @param state
 * @param pos 位置
 */
export const matchTag = (state: EditorState, pos: number): TagMatchResult | null => {
	const tree = ensureSyntaxTree(state, pos);
	if (!tree) {
		return null;
	}
	let node = tree.resolve(pos, -1);
	if (!isTag(node)) {
		node = tree.resolve(pos, 1);
		if (!isTag(node)) {
			return null;
		}
	}
	const start = getTag(state, node);
	if (isNested(node, start.type, start.name)) {
		return {matched: false, start};
	} else if (start.selfClosing) {
		return {matched: true, start};
	}
	const end = searchTag(state, start);
	return end ? {matched: true, start, end} : {matched: false, start};
};

const matchingMark = Decoration.mark({class: 'cm-matchingTag'}),
	nonmatchingMark = Decoration.mark({class: 'cm-nonmatchingTag'});

export const tagMatchingState = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(deco, {docChanged, selection, state}) {
		if (!docChanged && !selection) {
			return deco;
		}
		const decorations: Range<Decoration>[] = [];
		for (const range of state.selection.ranges) {
			if (range.empty) {
				const match = matchTag(state, range.head);
				if (match) {
					const mark = match.matched ? matchingMark : nonmatchingMark,
						{start: {from, to, closing}, end} = match;
					decorations.push(mark.range(from, to));
					if (end) {
						decorations[closing ? 'unshift' : 'push'](mark.range(end.from, end.to));
					}
				}
			}
		}
		return Decoration.set(decorations);
	},
	provide(f) {
		return EditorView.decorations.from(f);
	},
});
