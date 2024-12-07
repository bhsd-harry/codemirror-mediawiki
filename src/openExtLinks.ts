import {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {tokens} from './config';
import type {SyntaxNode} from '@lezer/common';

const {vendor, userAgent, maxTouchPoints, platform} = navigator;

export const isMac = vendor.includes('Apple Computer') && (userAgent.includes('Mobile/') || maxTouchPoints > 2)
	|| platform.includes('Mac');

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	links = ['extlink-protocol', 'extlink', 'free-extlink-protocol', 'free-extlink', 'magic-link'];

/**
 * 获取节点的名称
 * @param node 语法树节点
 */
function getName(node: SyntaxNode): string;
function getName(node: null): undefined;
function getName(node: SyntaxNode | null): string | undefined {
	return node?.name.replace(/_+/gu, ' ').trim();
}

/**
 * 查找连续同名节点
 * @param node 起始节点
 * @param dir 方向
 */
export const search = (node: SyntaxNode, dir: 'prevSibling' | 'nextSibling'): SyntaxNode => {
	const name = getName(node);
	while (getName(node[dir]!) === name) {
		node = node[dir]!; // eslint-disable-line no-param-reassign
	}
	return node;
};

export const openExtLinks = [
	EditorView.domEventHandlers({
		click(e, view) {
			if (!e[modKey]) {
				return undefined;
			}
			const position = view.posAtCoords(e);
			if (!position) {
				return undefined;
			}
			const {state} = view,
				node: SyntaxNode | null | undefined = ensureSyntaxTree(state, position)?.resolve(position, 1);
			if (!node) {
				return undefined;
			}
			const {name, from, to} = node;
			if (/-extlink-protocol/u.test(name)) {
				open(state.sliceDoc(from, search(node.nextSibling!, 'nextSibling').to), '_blank');
				return true;
			} else if (/-extlink(?:_|$)/u.test(name)) {
				const prev = search(node, 'prevSibling').prevSibling!,
					next = search(node, 'nextSibling');
				open(state.sliceDoc(prev.from, next.to), '_blank');
				return true;
			} else if (name.includes(tokens.magicLink)) {
				const link = state.sliceDoc(from, to);
				if (link.startsWith('RFC')) {
					open(`https://tools.ietf.org/html/rfc${link.slice(3).trim()}`, '_blank');
					return true;
				} else if (link.startsWith('PMID')) {
					open(`https://pubmed.ncbi.nlm.nih.gov/${link.slice(4).trim()}`, '_blank');
					return true;
				}
			}
			return undefined;
		},
	}),
	EditorView.theme({
		[links.map(type => `.cm-mw-${type}`).join()]: {
			cursor: 'pointer',
		},
	}),
];
