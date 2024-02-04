const {vendor, userAgent, maxTouchPoints, platform} = navigator,
	modKey = vendor.includes('Apple Computer') && (userAgent.includes('Mobile/') || maxTouchPoints > 2)
	|| platform.includes('Mac')
		? 'metaKey'
		: 'ctrlKey',
	pageSelector = '.cm-mw-template-name, .cm-mw-link-pagename';

/**
 * 点击时在新页面打开链接、模板等
 * @param e 点击事件
 */
const handler = function(this: HTMLElement, e: JQuery.ClickEvent): void {
	if (!e[modKey]) {
		return;
	}
	e.preventDefault();
	let page = this.textContent!,
		{previousSibling, nextSibling} = this;
	while (
		previousSibling
		&& (previousSibling.nodeType === Node.TEXT_NODE || (previousSibling as Element).matches(pageSelector))
	) {
		page = previousSibling.textContent! + page;
		({previousSibling} = previousSibling);
	}
	while (
		nextSibling
		&& (nextSibling.nodeType === Node.TEXT_NODE || (nextSibling as Element).matches(pageSelector))
	) {
		page += nextSibling.textContent!;
		({nextSibling} = nextSibling);
	}
	page = page.trim();
	if (page.startsWith('/')) {
		page = `:${mw.config.get('wgPageName')}${page}`;
	}
	open(new mw.Title(page, this.classList.contains('cm-mw-template-name') ? 10 : 0).getUrl(undefined), '_blank');
};

/**
 * 添加或移除打开链接的事件
 * @param ele 编辑器DOM
 * @param on 是否添加
 */
export const openLinks = (ele: HTMLElement, on?: boolean): void => {
	if (on) {
		mw.loader.load('mediawiki.Title');
		$(ele).on('click', pageSelector, handler);
	} else if (on === false) {
		$(ele).off('click', pageSelector, handler);
	}
};
