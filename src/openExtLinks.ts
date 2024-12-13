import {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {tokens} from './config';
import type {SyntaxNode} from '@lezer/common';

const {vendor, userAgent, maxTouchPoints, platform} = navigator;

export const isMac = vendor.includes('Apple Computer') && (userAgent.includes('Mobile/') || maxTouchPoints > 2)
	|| platform.includes('Mac');

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	links = ['extlink-protocol', 'extlink', 'free-extlink-protocol', 'free-extlink', 'magic-link'];

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
				open(state.sliceDoc(from, node.nextSibling!.to), '_blank');
				return true;
			} else if (/-extlink(?:_|$)/u.test(name)) {
				open(state.sliceDoc(node.prevSibling!.from, node.to), '_blank');
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
