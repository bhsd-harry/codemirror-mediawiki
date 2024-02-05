import {isMac} from './msg';
import type {CodeMirror} from './base';

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	pageSelector = '.cm-mw-template-name, .cm-mw-link-pagename',
	regex = /-template-name|link-pagename/u,
	handlers = new WeakMap<CodeMirror, JQuery.EventHandlerBase<HTMLElement, JQuery.ClickEvent>>();

/**
 * 点击时在新页面打开链接、模板等
 * @param cm CodeMirror实例
 * @param e 点击事件
 */
const getHandler = (cm: CodeMirror): JQuery.EventHandlerBase<HTMLElement, JQuery.ClickEvent> => {
	if (handlers.has(cm)) {
		return handlers.get(cm)!;
	}
	const handler: JQuery.EventHandlerBase<HTMLElement, JQuery.ClickEvent> = function(this, e): void {
		if (!e[modKey]) {
			return;
		}
		e.preventDefault();
		const {view} = cm,
			node = cm.getNodeAt(view.posAtCoords({x: e.clientX, y: e.clientY})!);
		if (!node) {
			return;
		}
		let prevSibling = node,
			nextSibling = node;
		while (regex.test(prevSibling.prevSibling?.name || '')) {
			prevSibling = prevSibling.prevSibling!;
		}
		while (regex.test(nextSibling.nextSibling?.name || '')) {
			nextSibling = nextSibling.nextSibling!;
		}
		let page = view.state.sliceDoc(prevSibling.from, nextSibling.to);
		if (page.startsWith('/')) {
			page = `:${mw.config.get('wgPageName')}${page}`;
		}
		open(new mw.Title(page, this.classList.contains('cm-mw-template-name') ? 10 : 0).getUrl(undefined), '_blank');
	};
	handlers.set(cm, handler);
	return handler;
};

/**
 * 添加或移除打开链接的事件
 * @param cm CodeMirror实例
 * @param on 是否添加
 */
export const openLinks = (cm: CodeMirror, on?: boolean): void => {
	if (on) {
		mw.loader.load('mediawiki.Title');
		$(cm.view.contentDOM).on('click', pageSelector, getHandler(cm)).css('--codemirror-cursor', 'pointer');
	} else if (on === false) {
		$(cm.view.contentDOM).off('click', pageSelector, getHandler(cm)).css('--codemirror-cursor', '');
	}
};
