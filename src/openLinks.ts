import {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {tokens} from './config';
import {hasTag} from './mediawiki';
import type {Extension} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';
import type {CodeMirror6} from './codemirror';
import type {TagName} from './token';

const {vendor, userAgent, maxTouchPoints, platform} = navigator;

export const isMac = vendor.includes('Apple Computer')
	&& (userAgent.includes('Mobile/') || maxTouchPoints > 2)
	|| platform.includes('Mac');

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	key = isMac ? 'Meta' : 'Control',
	tags: TagName[] = ['extLinkProtocol', 'extLink', 'freeExtLinkProtocol', 'freeExtLink', 'magicLink', 'pageName'],
	links = ['extlink-protocol', 'extlink', 'free-extlink-protocol', 'free-extlink', 'magic-link'],
	wikiLinks = [
		'template-name',
		'link-pagename',
		'parserfunction.cm-mw-pagename',
		'exttag-attribute-value.cm-mw-pagename',
		'file-text.cm-mw-pagename',
	];

document.addEventListener('keydown', e => {
	if (e.key === key) {
		for (const ele of document.querySelectorAll<HTMLDivElement>('.cm-content')) {
			ele.style.setProperty('--codemirror-cursor', 'pointer');
		}
	}
});
document.addEventListener('keyup', e => {
	if (e.key === key) {
		for (const ele of document.querySelectorAll<HTMLDivElement>('.cm-content')) {
			ele.style.removeProperty('--codemirror-cursor');
		}
	}
});

export default ({langConfig}: CodeMirror6): Extension => [
	EditorView.domEventHandlers({
		mousedown(e, view) {
			if (!e[modKey] || e.button !== 0) {
				return undefined;
			}
			const position = view.posAtCoords(e);
			if (!position) {
				return undefined;
			}
			const {state} = view,
				tree = ensureSyntaxTree(state, position);
			if (!tree) {
				return undefined;
			}
			let node: SyntaxNode = tree.resolve(position, -1);
			if (node.name.includes(tokens.linkToSection)) {
				node = node.prevSibling!;
			} else if (!hasTag(new Set(node.name.split('_')), tags)) {
				node = tree.resolve(position, 1);
			}
			const {name, from, to} = node;
			if (name.includes(tokens.pageName) && typeof langConfig?.titleParser === 'function') {
				return langConfig.titleParser(state, node, langConfig.urlProtocols);
			} else if (name.includes('-extlink-protocol')) {
				open(state.sliceDoc(from, node.nextSibling!.to), '_blank');
				return true;
			} else if (/-extlink(?:_|$)/u.test(name)) {
				open(state.sliceDoc(node.prevSibling!.from, to), '_blank');
				return true;
			} else if (name.includes(tokens.magicLink)) {
				const link = state.sliceDoc(from, to);
				if (link.startsWith('RFC')) {
					open(`https://tools.ietf.org/html/rfc${link.slice(3).trim()}`, '_blank');
					return true;
				} else if (link.startsWith('PMID')) {
					open(`https://pubmed.ncbi.nlm.nih.gov/${link.slice(4).trim()}`, '_blank');
					return true;
				} else if (typeof langConfig?.isbnParser === 'function') {
					return langConfig.isbnParser(link);
				}
			}
			return undefined;
		},
	}),
	EditorView.theme({
		[[...links, ...langConfig?.titleParser ? wikiLinks : []].map(type => `.cm-mw-${type}`).join()]: {
			cursor: 'var(--codemirror-cursor)',
		},
	}),
];
