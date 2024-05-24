import {isMac} from './msg';
import modeConfig from '../src/config';
import type {SyntaxNode} from '@lezer/common';
import type {CodeMirror} from './base';

declare type MouseEventListener = (e: MouseEvent) => void;

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	handlers = new WeakMap<CodeMirror, MouseEventListener>(),
	{tokens} = modeConfig;

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
			const link = state.sliceDoc(node.from, node.to).replace(/[\p{Zs}\t-]/gu, '').replace(/x$/u, 'X');
			if (link.startsWith('RFC')) {
				open(`https://tools.ietf.org/html/rfc${link.slice(3)}`, '_blank');
			} else if (link.startsWith('PMID')) {
				open(`https://pubmed.ncbi.nlm.nih.gov/${link.slice(4)}`, '_blank');
			} else {
				open(new mw.Title(`Special:Booksources/${link.slice(4)}`).getUrl(undefined), '_blank');
			}
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
