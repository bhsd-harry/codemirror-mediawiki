import {isMac} from './msg';
import {tokens} from '../src/config';
import type {SyntaxNode} from '@lezer/common';
import type {languages, editor} from 'monaco-editor';
import type {AST, TokenTypes} from 'wikiparser-node/base';
import type {CodeMirror} from './base';

declare type MouseEventListener = (e: MouseEvent) => void;

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	handlers = new WeakMap<CodeMirror, MouseEventListener>();

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
const search = (node: SyntaxNode, dir: 'prevSibling' | 'nextSibling'): SyntaxNode => {
	const name = getName(node);
	while (getName(node[dir]!) === name) {
		node = node[dir]!; // eslint-disable-line no-param-reassign
	}
	return node;
};

/**
 * 解析MagicLink
 * @param link 原链接文本
 */
const parseMagicLink = (link: string): string => {
	if (link.startsWith('RFC')) {
		return `https://tools.ietf.org/html/rfc${link.slice(3).trim()}`;
	} else if (link.startsWith('PMID')) {
		return `https://pubmed.ncbi.nlm.nih.gov/${link.slice(4).trim()}`;
	}
	return new mw.Title(`Special:Booksources/${link.slice(4).replace(/[\p{Zs}\t-]/gu, '').replace(/x$/u, 'X')}`)
		.getUrl(undefined);
};

/**
 * 点击时在新页面打开链接、模板等
 * @param cm
 * @param e 点击事件
 */
const getHandler = (cm: CodeMirror): MouseEventListener => {
	if (handlers.has(cm)) {
		return handlers.get(cm)!;
	}
	const handler: MouseEventListener = (e): void => {
		if (!e[modKey]) {
			return;
		}
		const {view} = cm,
			{state} = view!,
			node = cm.getNodeAt(view!.posAtCoords(e)!);
		if (!node) {
			// pass
		} else if (node.name.includes(tokens.pageName)) {
			e.preventDefault();
			e.stopPropagation();
			const name = getName(node),
				last = search(node, 'nextSibling'),
				{nextSibling} = last;
			let page = state.sliceDoc(search(node, 'prevSibling').from, last.to).trim();
			if (page.startsWith('/')) {
				page = `:${mw.config.get('wgPageName')}${page}`;
			}
			let ns = 0;
			if (name.includes(tokens.templateName)) {
				ns = 10;
			} else if (name.includes(tokens.parserFunction)) {
				ns = 828;
			} else if (nextSibling?.name.includes(tokens.linkToSection)) {
				page += state.sliceDoc(nextSibling.from, search(nextSibling, 'nextSibling').to).trim();
			}
			open(new mw.Title(page, ns).getUrl(undefined), '_blank');
		} else if (/-extlink-protocol/u.test(node.name)) {
			e.preventDefault();
			open(state.sliceDoc(node.from, search(node.nextSibling!, 'nextSibling').to), '_blank');
		} else if (/-extlink(?:_|$)/u.test(node.name)) {
			e.preventDefault();
			const prev = search(node, 'prevSibling').prevSibling!,
				next = search(node, 'nextSibling');
			open(state.sliceDoc(prev.from, next.to), '_blank');
		} else if (node.name.includes(tokens.magicLink)) {
			e.preventDefault();
			open(parseMagicLink(state.sliceDoc(node.from, node.to)), '_blank');
		}
	};
	handlers.set(cm, handler);
	return handler;
};

/**
 * 添加或移除打开链接的事件
 * @param cm
 * @param on 是否添加
 */
export const openLinks = (cm: CodeMirror, on?: boolean): void => {
	const {contentDOM} = cm.view!,
		handler = getHandler(cm);
	if (on) {
		mw.loader.load('mediawiki.Title');
		contentDOM.addEventListener('mousedown', handler, {capture: true});
		contentDOM.style.setProperty('--codemirror-cursor', 'pointer');
	} else if (on === false) {
		contentDOM.removeEventListener('mousedown', handler, {capture: true});
		contentDOM.style.removeProperty('--codemirror-cursor');
	}
};

const linkTypes = new Set<TokenTypes | undefined>(['link-target', 'template-name', 'invoke-module', 'magic-link']);

/**
 * 生成Monaco编辑器的链接
 * @param model
 * @param tree 语法树
 */
const generateLinks = (model: editor.ITextModel, tree: AST): languages.ILink[] => {
	const {type, childNodes, range: [from, to]} = tree;
	if (linkTypes.has(type)) {
		const fromPos = model.getPositionAt(from),
			toPos = model.getPositionAt(to),
			range = monaco.Range.fromPositions(fromPos, toPos);
		let url = model.getValueInRange(range).replace(/<!--.*?-->/gsu, '').trim();
		if (/[<>[\]|{}]/u.test(url)) {
			return [];
		}
		try {
			if (type === 'magic-link') {
				url = parseMagicLink(url);
			} else {
				let ns = 0;
				if (type === 'template-name') {
					ns = 10;
				} else if (type === 'invoke-module') {
					ns = 828;
				}
				if (url.startsWith('/')) {
					url = `:${mw.config.get('wgPageName')}${url}`;
				}
				url = new mw.Title(url, ns).getUrl(undefined);
			}
			if (url.startsWith('//')) {
				url = location.protocol + url;
			} else if (url.startsWith('/')) {
				url = location.origin + url;
			}
			return [{range, url}];
		} catch {
			console.debug(`Unable to parse title: ${url}`);
			return [];
		}
	}
	return childNodes?.flatMap(node => generateLinks(model, node)) || [];
};

export const linkProvider: languages.LinkProvider = {
	async provideLinks(model) {
		return {
			links: 'wikiparse' in window
				? generateLinks(model, await wikiparse.json(model.getValue(), true, -4, 9))
				: [],
		};
	},
};
