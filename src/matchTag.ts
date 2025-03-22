import {Decoration, EditorView} from '@codemirror/view';
import {StateField} from '@codemirror/state';
import {ensureSyntaxTree} from '@codemirror/language';
import {voidHtmlTags} from './config';
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
	declare readonly state;

	get closing(): boolean {
		return isClosing(this.first, this.type, this.state, true);
	}

	get selfClosing(): boolean {
		return voidHtmlTags.includes(this.name) || this.type === 'ext' && isClosing(this.last, this.type, this.state);
	}

	get from(): number {
		const {first: {from, to}, state} = this;
		return from + state.sliceDoc(from, to).lastIndexOf('<');
	}

	get to(): number {
		const {last: {from, to}, state} = this;
		return from + state.sliceDoc(from, to).indexOf('>') + 1;
	}

	constructor(type: TagType, name: string, first: SyntaxNode, last: SyntaxNode, state: EditorState) {
		this.type = type;
		this.name = name;
		this.first = first;
		this.last = last;
		this.state = state;
	}
}

const isTag = ({name}: SyntaxNode): boolean => /-(?:ext|html)tag-(?!bracket)/u.test(name),
	isTagComponent = (s: string) => {
		const reHtml = new RegExp(`-htmltag-${s}`, 'u'),
			reExt = new RegExp(`-exttag-${s}`, 'u');
		return ({name}: SyntaxNode, type: TagType): boolean => (type === 'ext' ? reExt : reHtml).test(name);
	},
	isBracket = isTagComponent('bracket'),
	isName = isTagComponent('name'),
	isClosing = (node: SyntaxNode, type: TagType, state: EditorState, first?: boolean): boolean => isBracket(node, type)
		&& state.sliceDoc(node.from, node.to)[first ? 'endsWith' : 'startsWith']('/'),
	getName = (state: EditorState, {from, to}: SyntaxNode): string => state.sliceDoc(from, to).trim().toLowerCase();

/**
 * 获取标签信息，破损的HTML标签会返回`null`
 * @param state
 * @param node 语法树节点
 */
export const getTag = (state: EditorState, node: SyntaxNode): Tag | null => {
	const type = node.name.includes('exttag') ? 'ext' : 'html';
	let {nextSibling, prevSibling} = node,
		nameNode = isName(node, type) ? node : null;
	while (nextSibling && !isBracket(nextSibling, type)) {
		({nextSibling} = nextSibling);
	}
	if (
		!nextSibling
		|| isBracket(nextSibling, type) && state.sliceDoc(nextSibling.from, nextSibling.from + 1) === '<'
	) {
		return null;
	}
	while (prevSibling && !isBracket(prevSibling, type)) {
		nameNode ??= isName(prevSibling, type) ? prevSibling : null;
		({prevSibling} = prevSibling);
	}
	const name = getName(state, nameNode!);
	return new Tag(type, name, prevSibling!, nextSibling, state);
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
		if (isName(sibling, type) && getName(state, sibling) === name) {
			const tag = getTag(state, sibling);
			if (tag) {
				stack += tag.closing ? -1 : 1;
				if (stack === 0) {
					return tag;
				}
				sibling = tag[endGetter];
			}
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
	if (!start) {
		return null;
	} else if (start.selfClosing) {
		return {matched: true, start};
	}
	const end = searchTag(state, start);
	return end ? {matched: true, start, end} : {matched: false, start};
};

const matchingMark = Decoration.mark({class: 'cm-matchingTag'}),
	nonmatchingMark = Decoration.mark({class: 'cm-nonmatchingTag'});

export default StateField.define<DecorationSet>({
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
