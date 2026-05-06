import {
	keymap,
	GutterMarker,
	gutter,
	ViewPlugin,
} from '@codemirror/view';
import {
	RangeSetBuilder,
	RangeSet,
} from '@codemirror/state';
import {
	syntaxTree,
	ensureSyntaxTree,
	foldEffect,
	unfoldEffect,
	foldedRanges,
	unfoldAll,
	codeFolding,
	foldState,
	language,
} from '@codemirror/language';
import {getRegex} from '@bhsd/common';
import elt from 'crelt';
import {tokens} from './config.js';
import {
	mwTag,
} from './constants.js';
import {searchTag, getTag} from './matchTag.js';
import {braceStackUpdate, sliceDoc} from './util.js';
import type {
	ViewUpdate,
	BlockInfo,
	PluginValue,
	Command,
	EditorView,
} from '@codemirror/view';
import type {EditorState, StateEffect, Extension} from '@codemirror/state';
import type {SyntaxNode, Tree} from '@lezer/common';
import type {TagName} from './config';
import type {DocRange} from './util';

declare type AnchorUpdate = (pos: number, range: DocRange) => number;
/** @returns 折叠范围或是否继续查找 */
declare type FoldableLineEndCheck = (from: number, to?: number) => DocRange | boolean;

const getExtRegex = /* @__PURE__ */ getRegex(tag => new RegExp(`mw-tag-${tag}(?![a-z])`, 'u'));

export const updateSelection: AnchorUpdate = (pos, {to}): number => Math.max(pos, to),
	updateAll: AnchorUpdate = (pos, {from, to}) => from <= pos && to > pos ? to : pos;

/**
 * Check if a SyntaxNode is among the specified components
 * @param keys The keys of the tokens to check
 */
const isComponent = (keys: TagName[]) =>
		(node: SyntaxNode | null): boolean => keys.some(key => node?.name.includes(tokens[key])),

	/** Check if a SyntaxNode is a template bracket (`{{` or `}}`) */
	isTemplateBracket = /* @__PURE__ */ isComponent(['templateBracket', 'parserFunctionBracket']),

	/** Check if a SyntaxNode is a template name */
	isTemplateName = /* @__PURE__ */ isComponent(['templateName', 'parserFunctionName']),

	/** Check if a SyntaxNode is a template delimiter (`|` or `:`) */
	isDelimiter = /* @__PURE__ */ isComponent(['templateDelimiter', 'parserFunctionDelimiter']),

	/**
	 * Check if a SyntaxNode is a template delimiter (`|` or `:`), excluding `subst:` and `safesubst:`
	 * @param node SyntaxNode
	 */
	isTemplateDelimiter = (node: SyntaxNode): boolean => isDelimiter(node) && !isTemplateName(node.nextSibling),

	/**
	 * Check if a SyntaxNode is part of a template, except for the brackets
	 * @param node 语法树节点
	 */
	isTemplate = (node: SyntaxNode): boolean =>
		/-(?:template|ext)[a-z\d-]+ground/u.test(node.name) && !isTemplateBracket(node),

	/** Check if a SyntaxNode is an extension tag bracket (`<` or `>`) */
	isExtBracket = /* @__PURE__ */ isComponent(['extTagBracket']),

	/**
	 * Check if a SyntaxNode is part of a extension tag
	 * @param node 语法树节点
	 * @param refOnly 是否仅检查`<ref>`标签
	 */
	isExt = (node: SyntaxNode, refOnly: boolean): boolean =>
		node.name.includes(`mw-tag-${refOnly ? 'ref' : ''}`);

const refNames = new Set<string | undefined>(['ref', 'references']);

/**
 * 寻找可折叠的范围
 * @param state
 * @param posOrNode 字符位置或语法树节点
 * @param tree 语法树
 * @param refOnly 是否仅检查`<ref>`标签
 */
export const foldableInline = (
	state: EditorState,
	posOrNode: number | SyntaxNode,
	tree?: Tree | null,
	refOnly = false,
): DocRange | false => {
	if (typeof posOrNode === 'number') {
		tree = ensureSyntaxTree(state, posOrNode);
	}
	if (!tree) {
		return false;
	}
	let node: SyntaxNode;
	if (typeof posOrNode === 'number') {
		// Find the initial template node on both sides of the position
		const left = tree.resolve(posOrNode, -1);
		if (!refOnly && isTemplate(left)) {
			node = left;
		} else {
			const right = tree.resolve(posOrNode, 1);
			node = isExt(left, refOnly)
				&& left.name.split(mwTag).length > right.name.split(mwTag).length
				? left
				: right;
		}
	} else {
		node = posOrNode;
	}
	if (refOnly || !isTemplate(node)) {
		// Not a template
		if (isExt(node, refOnly)) {
			const {name} = node,
				[tag] = /^[a-z]+/u.exec(name.slice(name.lastIndexOf(mwTag) + 7))!,
				regex = getExtRegex(tag);
			let {nextSibling} = node;
			while (nextSibling && !(isExtBracket(nextSibling) && !regex.test(nextSibling.name))) {
				({nextSibling} = nextSibling);
			}
			const next = nextSibling?.nextSibling,
				closing = next && getTag(state, next);
			// The closing bracket of the current extension tag
			if (closing && (!refOnly || refNames.has(closing.name))) {
				return {from: searchTag(state, closing)!.to, to: nextSibling!.from};
			}
		}
		return false;
	}
	let {prevSibling, nextSibling} = node,
		/** The stack of opening (+) or closing (-) brackets */ stack = 1,
		/** The first delimiter */ delimiter: SyntaxNode | null = isTemplateDelimiter(node) ? node : null,
		/** The start of the closing bracket */ to = 0;
	while (nextSibling) {
		if (isTemplateBracket(nextSibling)) {
			const [lbrace, rbrace] = braceStackUpdate(state, nextSibling);
			stack += rbrace;
			if (stack <= 0) {
				// The closing bracket of the current template
				to = nextSibling.from
					+ sliceDoc(state, nextSibling)
						.split('}}').slice(0, stack - 1).join('}}').length;
				break;
			}
			stack += lbrace;
		} else if (!delimiter && stack === 1 && isTemplateDelimiter(nextSibling)) {
			// The first delimiter of the current template so far
			delimiter = nextSibling;
		}
		({nextSibling} = nextSibling);
	}
	if (!nextSibling) {
		// The closing bracket of the current template is missing
		return false;
	}
	stack = -1;
	while (prevSibling) {
		if (isTemplateBracket(prevSibling)) {
			const [lbrace, rbrace] = braceStackUpdate(state, prevSibling);
			stack += lbrace;
			if (stack >= 0) {
				// The opening bracket of the current template
				break;
			}
			stack += rbrace;
		} else if (stack === -1 && isTemplateDelimiter(prevSibling)) {
			// The first delimiter of the current template so far
			delimiter = prevSibling;
		}
		({prevSibling} = prevSibling);
	}
	const /** The end of the first delimiter */ from = delimiter?.to;
	return from && from < to ? {from, to} : false;
};

/**
 * 执行折叠
 * @param view
 * @param effects 折叠
 * @param anchor 光标位置
 */
const execute = (view: EditorView, effects: StateEffect<DocRange>[], anchor: number): boolean => {
	if (effects.length > 0) {
		// Fold the template(s) and update the cursor position
		view.dispatch({
			effects,
			selection: {anchor},
		});
		return true;
	}
	return false;
};

/**
 * The rightmost position of all selections, to be updated with folding
 * @param state
 */
const getAnchor = (state: EditorState): number => Math.max(...state.selection.ranges.map(({to}) => to));

/**
 * 折叠所有模板
 * @param state
 * @param tree 语法树
 * @param effects 折叠
 * @param node 语法树节点
 * @param end 终止位置
 * @param anchor 光标位置
 * @param update 更新光标位置
 * @param refOnly 是否仅检查`<ref>`标签
 */
export const traverse = (
	state: EditorState,
	tree: Tree,
	effects: StateEffect<DocRange>[],
	node: SyntaxNode | null,
	end: number,
	anchor: number,
	update: AnchorUpdate,
	refOnly?: boolean,
): number => {
	while (
		node && (
			node.from < end
			|| node.from === end
			&& !(isTemplateBracket(node) && sliceDoc(state, node).startsWith('}}'))
		)
	) {
		const range = foldableInline(state, node, tree, refOnly);
		if (range) {
			effects.push(foldEffect.of(range));
			node = tree.resolve(range.to, 1);
			// Update the anchor with the end of the last folded range
			anchor = update(anchor, range);
			continue;
		}
		node = node.nextSibling;
	}
	return anchor;
};

class MyFoldMarker extends GutterMarker {
	declare readonly open;

	constructor(open: boolean) {
		super();
		this.open = open;
	}

	override eq(other: this): boolean {
		return this.open === other.open;
	}

	override toDOM({state}: EditorView): HTMLElement {
		return elt('span', {title: state.phrase(this.open ? 'Fold line' : 'Unfold line')}, this.open ? '⌄' : '›');
	}
}

const canFold = /* @__PURE__ */ new MyFoldMarker(true),
	canUnfold = /* @__PURE__ */ new MyFoldMarker(false);

const myFindFold = ({state}: EditorView, line: BlockInfo): DocRange | undefined => {
	let found: DocRange | undefined;
	state.field(foldState, false)?.between(line.from, line.to, (from, to) => {
		if (!found && to === line.to) {
			found = {from, to};
		}
	});
	return found;
};

export const foldableLine = ({state, viewportLineBlocks}: EditorView, {from: f, to: t}: DocRange): DocRange | false => {
	const tree = syntaxTree(state),
		{doc} = state,
		{length} = viewportLineBlocks;

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
		loop = (checkLine: FoldableLineEndCheck): DocRange | boolean => {
			let i = 0;
			while (i <= doc.lines) {
				const {from, to} = i < length ? viewportLineBlocks[i]! : doc.line(i);
				if (from >= tree.topNode.to) {
					return from === doc.length;
				} else if (from > f) {
					/** 折叠范围或是否继续查找 */
					const result = checkLine(from, to);
					if (result !== true) {
						return result;
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
		return result === true
			? t < doc.length && {from: t, to: doc.length}
			: result;
	} else if (getTable(f, t) === 1) {
		const checkLine: FoldableLineEndCheck = (from, to) => {
			const bracket = getTable(from, to!);
			return bracket === -1 ? t < from - 1 && {from: t, to: from - 1} : bracket !== 1 && getLevel(from) === 7;
		};
		const /** 折叠范围或是否继续查找 */ result = loop(checkLine);
		return typeof result === 'object' && result;
	}
	return false;
};

export const buildMarkers = (view: EditorView): RangeSet<MyFoldMarker> => {
	const builder = new RangeSetBuilder<MyFoldMarker>();
	for (const line of view.viewportLineBlocks) {
		let mark: MyFoldMarker | undefined;
		if (myFindFold(view, line)) {
			mark = canUnfold;
		} else if (foldableLine(view, line)) {
			mark = canFold;
		}
		if (mark) {
			builder.add(line.from, line.from, mark);
		}
	}
	return builder.finish();
};

const markers = /* @__PURE__ */ ViewPlugin.fromClass(class implements PluginValue {
	declare tree;
	declare markers;

	constructor(view: EditorView) {
		this.tree = syntaxTree(view.state);
		this.markers = buildMarkers(view);
	}

	update({docChanged, viewportChanged, startState, state, view}: ViewUpdate): void {
		const tree = syntaxTree(state);
		if (
			docChanged
			|| viewportChanged
			|| startState.facet(language) !== state.facet(language)
			|| startState.field(foldState, false) !== state.field(foldState, false)
			|| tree !== this.tree
		) {
			this.tree = tree;
			this.markers = buildMarkers(view);
		}
	}
});

/**
 * 生成折叠命令
 * @param refOnly 是否仅检查`<ref>`标签
 */
export const foldCommand = (refOnly?: boolean): Command => view => {
	const {state} = view,
		tree = ensureSyntaxTree(state, state.doc.length, 1e3) ?? syntaxTree(state),
		effects: StateEffect<DocRange>[] = [];
	let anchor = traverse(
		state,
		tree,
		effects,
		tree.topNode.firstChild,
		Infinity,
		getAnchor(state),
		updateAll,
		refOnly,
	);
	if (!refOnly) {
		for (let pos = 0; pos < state.doc.length;) {
			const line = view.lineBlockAt(pos),
				range = foldableLine(view, line);
			if (range) {
				effects.push(foldEffect.of(range));
				anchor = updateAll(anchor, range);
			}
			pos = (range ? view.lineBlockAt(range.to) : line).to + 1;
		}
	}
	return execute(view, effects, anchor);
};

export const foldRef = /* @__PURE__ */ foldCommand(true);

export const mySelectedLines = (view: EditorView): BlockInfo[] => {
	const lines: BlockInfo[] = [];
	for (const {head} of view.state.selection.ranges) {
		if (lines.some(({from, to}) => from <= head && to >= head)) {
			continue;
		}
		lines.push(view.lineBlockAt(head));
	}
	return lines;
};

const myFoldCode = (view: EditorView, line: BlockInfo): boolean => {
	const range = foldableLine(view, line);
	if (range) {
		view.dispatch({effects: foldEffect.of(range)});
		return true;
	}
	return false;
};

const myUnfoldCode = (view: EditorView, line: BlockInfo): StateEffect<DocRange> | undefined => {
	const folded = myFindFold(view, line);
	return folded && unfoldEffect.of(folded);
};

export const foldAt: Command = view => {
	const {state} = view,
		tree = syntaxTree(state),
		effects: StateEffect<DocRange>[] = [];
	let anchor = getAnchor(state);
	for (const {from, to, empty} of state.selection.ranges) {
		let node: SyntaxNode | null | undefined;
		if (empty) {
			// No selection, try both sides of the cursor position
			node = tree.resolve(from, -1);
		}
		if (!node || node.name === 'Document') {
			node = tree.resolve(from, 1);
		}
		anchor = traverse(state, tree, effects, node, to, anchor, updateSelection);
	}
	if (effects.length > 0) {
		return execute(view, effects, anchor);
	}
	for (const line of mySelectedLines(view)) {
		if (myFoldCode(view, line)) {
			return true;
		}
	}
	return false;
};

/**
 * Get the [codeFolding](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#codefolding)
 * extension for Wikitext.
 */
export default (
): Extension => [
	codeFolding({
		placeholderDOM(view) {
			const element = elt(
				'span',
				{'aria-label': 'folded code', title: view.state.phrase('unfold'), class: 'cm-foldPlaceholder'},
				'…',
			);
			element.addEventListener('click', ({target}) => {
				const pos = view.posAtDOM(target as Node),
					{state} = view,
					{selection} = state;
				foldedRanges(state).between(pos, pos, (from, to) => {
					if (from === pos) {
						// Unfold the template and redraw the selections
						view.dispatch({effects: unfoldEffect.of({from, to}), selection});
					}
				});
			});
			return element;
		},
	}),
	keymap.of([
		{
			// Fold the template at the selection/cursor
			key: 'Ctrl-Shift-[',
			mac: 'Cmd-Alt-[',
			run: foldAt,
		},
		{
			// Fold all templates in the document
			key: 'Ctrl-Alt-[',
			run: foldCommand(),
		},
		{
			// Fold all `<ref>` tags in the document
			key: 'Mod-Alt-,',
			run: foldRef,
		},
		{
			// Unfold the template at the selection/cursor
			key: 'Ctrl-Shift-]',
			mac: 'Cmd-Alt-]',
			run(view): boolean {
				const {state} = view,
					{selection} = state,
					effects: StateEffect<DocRange>[] = [],
					folded = foldedRanges(state);
				for (const {from, to} of selection.ranges) {
					// Unfold any folded range at the selection
					folded.between(from, to, (i, j) => {
						effects.push(unfoldEffect.of({from: i, to: j}));
					});
				}
				if (effects.length > 0) {
					// Unfold the template(s) and redraw the selections
					view.dispatch({effects, selection});
					return true;
				}
				for (const line of mySelectedLines(view)) {
					const effect = myUnfoldCode(view, line);
					if (effect) {
						effects.push(effect);
					}
				}
				if (effects.length > 0) {
					view.dispatch({effects});
					return true;
				}
				return false;
			},
		},
		{key: 'Ctrl-Alt-]', run: unfoldAll},
	]),
	markers,
	gutter({
		class: 'cm-foldGutter',
		markers(view) {
			return view.plugin(markers)?.markers ?? RangeSet.empty;
		},
		initialSpacer() {
			return new MyFoldMarker(false);
		},
		domEventHandlers: {
			click(view, line) {
				const effects = myUnfoldCode(view, line);
				if (effects) {
					view.dispatch({effects});
					return true;
				}
				return myFoldCode(view, line);
			},
		},
	}),
];
