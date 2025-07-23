import {keymap, GutterMarker, ViewPlugin} from '@codemirror/view';
import {RangeSetBuilder} from '@codemirror/state';
import {
	syntaxTree,
	ensureSyntaxTree,
	foldEffect,
	foldedRanges,
	foldGutter,
	foldKeymap,
	foldState,
	language,
} from '@codemirror/language';
import {getRegex} from '@bhsd/common';
import {tokens} from './config';
import {matchTag, getTag} from './matchTag';
import type {EditorView, Tooltip, TooltipView, ViewUpdate, BlockInfo, PluginValue, Command} from '@codemirror/view';
import type {EditorState, StateEffect, Extension, RangeSet} from '@codemirror/state';
import type {SyntaxNode, Tree} from '@lezer/common';
import type {TagName} from './token';
import type {Addon} from './codemirror';

export interface DocRange {
	from: number;
	to: number;
}

declare type AnchorUpdate = (pos: number, range: DocRange) => number;

const getExtRegex = /* @__PURE__ */ getRegex(tag => new RegExp(`mw-tag-${tag}(?![a-z])`, 'u'));

export const updateSelection: AnchorUpdate = (pos, {to}): number => Math.max(pos, to);
const updateAll: AnchorUpdate = (pos, {from, to}) => from <= pos && to > pos ? to : pos;

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

/**
 * Update the stack of opening (+) or closing (-) brackets
 * @param state
 * @param node 语法树节点
 */
export const braceStackUpdate = (state: EditorState, node: SyntaxNode): [number, number] => {
	const brackets = state.sliceDoc(node.from, node.to);
	return [brackets.split('{{').length - 1, 1 - brackets.split('}}').length];
};

const refNames = new Set<string | undefined>(['ref', 'references']);

/**
 * 寻找可折叠的范围
 * @param state
 * @param posOrNode 字符位置或语法树节点
 * @param tree 语法树
 * @param refOnly 是否仅检查`<ref>`标签
 */
export const foldable = (
	state: EditorState,
	posOrNode: number | SyntaxNode,
	tree?: Tree | null,
	refOnly = false,
): DocRange | false => {
	if (typeof posOrNode === 'number') {
		tree = ensureSyntaxTree(state, posOrNode); // eslint-disable-line no-param-reassign
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
				&& left.name.split('mw-tag-').length > right.name.split('mw-tag-').length
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
				[tag] = /^[a-z]+/u.exec(name.slice(name.lastIndexOf('mw-tag-') + 7))!,
				regex = getExtRegex(tag);
			let {nextSibling} = node;
			while (nextSibling && !(isExtBracket(nextSibling) && !regex.test(nextSibling.name))) {
				({nextSibling} = nextSibling);
			}
			const next = nextSibling?.nextSibling;
			// The closing bracket of the current extension tag
			if (nextSibling && (!refOnly || next && refNames.has(getTag(state, next)?.name))) {
				return {from: matchTag(state, nextSibling.to)!.end!.to, to: nextSibling.from};
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
					+ state.sliceDoc(nextSibling.from, nextSibling.to)
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
 * 创建折叠提示
 * @param state
 */
export const create = (state: EditorState): Tooltip | null => {
	const {selection: {main: {head}}} = state,
		range = foldable(state, head);
	if (range) {
		const {from, to} = range;
		let folded = false;
		foldedRanges(state).between(from, to, (i, j) => {
			if (i === from && j === to) {
				folded = true;
			}
		});
		return folded // eslint-disable-line @typescript-eslint/no-unnecessary-condition
			? null
			: {
				pos: head,
				above: true,
				create(): TooltipView {
					const dom = document.createElement('div');
					dom.className = 'cm-tooltip-fold';
					dom.textContent = '\uff0d';
					dom.title = state.phrase('Fold template or extension tag');
					dom.dataset['from'] = String(from);
					dom.dataset['to'] = String(to);
					return {dom};
				},
			};
	}
	return null;
};

/**
 * 执行折叠
 * @param view
 * @param effects 折叠
 * @param anchor 光标位置
 */
export const execute = (view: EditorView, effects: StateEffect<DocRange>[], anchor: number): boolean => {
	if (effects.length > 0) {
		view.dom.querySelector('.cm-tooltip-fold')?.remove();
		// Fold the template(s) and update the cursor position
		view.dispatch({effects, selection: {anchor}});
		return true;
	}
	return false;
};

/**
 * The rightmost position of all selections, to be updated with folding
 * @param state
 */
export const getAnchor = (state: EditorState): number => Math.max(...state.selection.ranges.map(({to}) => to));

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
	while (node && node.from <= end) {
		/* eslint-disable no-param-reassign */
		const range = foldable(state, node, tree, refOnly);
		if (range) {
			effects.push(foldEffect.of(range));
			node = tree.resolve(range.to, 1);
			// Update the anchor with the end of the last folded range
			anchor = update(anchor, range);
			continue;
		}
		node = node.nextSibling;
		/* eslint-enable no-param-reassign */
	}
	return anchor;
};

export class FoldMarker extends GutterMarker {
	declare readonly open;

	constructor(open: boolean) {
		super();
		this.open = open;
	}

	override eq(other: this): boolean {
		return this.open === other.open;
	}

	override toDOM({state}: EditorView): HTMLSpanElement {
		const span = document.createElement('span');
		span.textContent = this.open ? '⌄' : '›';
		span.title = state.phrase(this.open ? 'Fold line' : 'Unfold line');
		return span;
	}
}

const canFold = /* @__PURE__ */ new FoldMarker(true),
	canUnfold = /* @__PURE__ */ new FoldMarker(false);

export const findFold = ({state}: EditorView, line: BlockInfo): DocRange | undefined => {
	let found: DocRange | undefined;
	state.field(foldState, false)?.between(line.from, line.to, (from, to) => {
		if (!found && to === line.to) {
			found = {from, to};
		}
	});
	return found;
};

export const foldableLine = (
	{state, viewport: {to: end}, viewportLineBlocks}: EditorView,
	{from: f, to: t}: DocRange,
): DocRange | false => {
	const tree = syntaxTree(state);

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
			const line = state.sliceDoc(from, to),
				bracket = /^\s*(?:(?::+\s*)?\{\||\|\})/u.exec(line)?.[0];
			if (bracket) {
				const {name} = tree.resolve(from + bracket.length, -1);
				if (name.includes(tokens.tableBracket)) {
					return bracket.endsWith('|}') ? -1 : 1;
				}
			}
			return 0;
		};

	const level = getLevel(f);
	if (level < 7) {
		for (const {from} of viewportLineBlocks) {
			if (from > f && getLevel(from) <= level) {
				return t < from - 1 && {from: t, to: from - 1};
			}
		}
		return end === state.doc.length && end > t && {from: t, to: end};
	} else if (getTable(f, t) === 1) {
		for (const {from, to} of viewportLineBlocks) {
			if (from > f) {
				const bracket = getTable(from, to);
				if (bracket === -1) {
					return t < from - 1 && {from: t, to: from - 1};
				} else if (bracket === 1 || getLevel(from) < 7) {
					break;
				}
			}
		}
	}
	return false;
};

const buildMarkers = (view: EditorView): RangeSet<FoldMarker> => {
	const builder = new RangeSetBuilder<FoldMarker>();
	for (const line of view.viewportLineBlocks) {
		let mark: FoldMarker | undefined;
		if (findFold(view, line)) {
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

export const markers = /* @__PURE__ */ ViewPlugin.fromClass(class implements PluginValue {
	declare markers;

	constructor(view: EditorView) {
		this.markers = buildMarkers(view);
	}

	update({docChanged, viewportChanged, startState, state, view}: ViewUpdate): void {
		if (
			docChanged
			|| viewportChanged
			|| startState.facet(language) !== state.facet(language)
			|| startState.field(foldState, false) !== state.field(foldState, false)
			|| syntaxTree(startState) !== syntaxTree(state)
		) {
			this.markers = buildMarkers(view);
		}
	}
});

const defaultFoldExtension = [foldGutter(), keymap.of(foldKeymap)];

/**
 * 生成折叠命令
 * @param refOnly 是否仅检查`<ref>`标签
 */
export const foldCommand = (refOnly?: boolean): Command => view => {
	const {state} = view,
		tree = syntaxTree(state),
		effects: StateEffect<DocRange>[] = [],
		anchor = traverse(
			state,
			tree,
			effects,
			tree.topNode.firstChild,
			Infinity,
			getAnchor(state),
			updateAll,
			refOnly,
		);
	return execute(view, effects, anchor);
};

export const foldRef = /* @__PURE__ */ foldCommand(true);

export default [(e = defaultFoldExtension): Extension => e] satisfies Addon<Extension>;

/**
 * 点击提示折叠模板参数
 * @param view
 */
export const foldHandler = (view: EditorView) => (e: MouseEvent): void => {
	const dom = (e.target as Element).closest<HTMLElement>('.cm-tooltip-fold');
	if (dom) {
		e.preventDefault();
		const {dataset} = dom,
			from = Number(dataset['from']),
			to = Number(dataset['to']);
		view.dispatch({
			effects: foldEffect.of({from, to}),
			selection: {anchor: to},
		});
		dom.remove();
	}
};
