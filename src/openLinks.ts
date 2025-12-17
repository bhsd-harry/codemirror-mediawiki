import {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {tokens} from './config';
import {isMac} from './constants';
import type {Extension} from '@codemirror/state';
import type {CodeMirror6} from './codemirror';
import type {MwConfig} from './token';

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	key = isMac ? 'Meta' : 'Control',
	links = ['extlink-protocol', 'extlink', 'free-extlink-protocol', 'free-extlink', 'magic-link'],
	pagename = '.cm-mw-pagename',
	wikiLinks = [
		'template-name',
		'link-pagename',
		`parserfunction${pagename}`,
		`exttag-attribute-value${pagename}`,
		`file-text${pagename}`,
	];

const toggleOpenLinks = (toggle?: boolean): void => {
	for (const ele of document.querySelectorAll<HTMLDivElement>('.cm-content')) {
		if (toggle) {
			ele.style.setProperty('--codemirror-cursor', 'pointer');
		} else {
			ele.style.removeProperty('--codemirror-cursor');
		}
	}
};

/* eslint-disable @typescript-eslint/no-unnecessary-condition */
globalThis.document?.addEventListener('keydown', e => {
	if (e.key === key) {
		toggleOpenLinks(true);
	}
});
globalThis.document?.addEventListener('keyup', e => {
	if (e.key === key) {
		toggleOpenLinks();
	}
});
globalThis.document?.addEventListener('visibilitychange', () => {
	if (document.hidden) {
		toggleOpenLinks();
	}
});
/* eslint-enable @typescript-eslint/no-unnecessary-condition */

const wrapURL = (url: string): string => url.startsWith('//') ? location.protocol + url : url;

export const mouseEventListener = (
	e: MouseEvent,
	view: EditorView,
	langConfig: MwConfig | undefined,
): string | undefined => {
	if (
		!e[modKey]
		|| !(e.target instanceof Element && getComputedStyle(e.target).textDecorationLine === 'underline')
	) {
		return undefined;
	}
	const posAndSide = view.posAndSideAtCoords(e);
	if (!posAndSide) {
		return undefined;
	}
	const {state} = view,
		tree = ensureSyntaxTree(state, posAndSide.pos + (posAndSide.assoc === 1 ? 1 : 0));
	if (!tree) {
		return undefined;
	}
	let node = tree.resolve(posAndSide.pos, posAndSide.assoc);
	if (node.name.includes(tokens.linkToSection)) {
		node = node.prevSibling!;
	}
	const {name, from, to} = node;
	if (name.includes(tokens.pageName) && typeof langConfig?.titleParser === 'function') {
		return langConfig.titleParser(state, node);
	} else if (name.includes('-extlink-protocol')) {
		return wrapURL(state.sliceDoc(from, node.nextSibling!.to));
	} else if (/-extlink(?:_|$)/u.test(name)) {
		return wrapURL(state.sliceDoc(node.prevSibling!.from, to));
	} else if (name.includes(tokens.magicLink)) {
		const link = state.sliceDoc(from, to);
		if (link.startsWith('RFC')) {
			return `https://datatracker.ietf.org/doc/html/rfc${link.slice(3).trim()}`;
		} else if (link.startsWith('PMID')) {
			return `https://pubmed.ncbi.nlm.nih.gov/${link.slice(4).trim()}`;
		} else if (typeof langConfig?.isbnParser === 'function') {
			return langConfig.isbnParser(link);
		}
	}
	return undefined;
};

export default ({langConfig}: CodeMirror6): Extension => [
	EditorView.domEventHandlers({
		mousedown(e, view) {
			if (e.button !== 0) {
				return undefined;
			}
			const url = mouseEventListener(e, view, langConfig);
			if (url) {
				open(url, '_blank', 'noopener noreferrer');
				return true;
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
