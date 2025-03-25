import {normalizeTitle} from '@bhsd/common';
import {tokens} from '../src/config';
import type {MwConfig} from '../src/token';

export const getTitleParser = ({urlProtocols}: MwConfig): MwConfig['titleParser'] => {
	const re = new RegExp(`^(?:${urlProtocols})`, 'iu');
	return (state, node) => {
		const {from, to, name, nextSibling} = node;
		let page = state.sliceDoc(from, to).trim();
		if (name.includes(tokens.fileText) && re.test(page)) {
			open(page, '_blank');
			return true;
		}
		if (page.startsWith('/')) {
			page = `:${mw.config.get('wgPageName')}${page}`;
		}
		let ns = 0;
		if (name.includes(tokens.templateName) || name.includes(tokens.extTagAttributeValue)) {
			ns = 10;
		} else if (name.includes(tokens.parserFunction)) {
			if (name.includes('mw-widget')) {
				ns = 274;
			} else if (name.includes('mw-invoke')) {
				ns = 828;
			} else {
				ns = Number(/mw-function-(\d+)/u.exec(name)?.[1] ?? 0);
			}
		} else if (nextSibling?.name.includes(tokens.linkToSection)) {
			page += state.sliceDoc(nextSibling.from, nextSibling.to).trim();
		}
		const url = mw.Title.newFromText(normalizeTitle(page), ns)?.getUrl(undefined);
		if (url) {
			open(url, '_blank');
			return true;
		}
		return undefined;
	};
};

export const isbnParser = (link: string): true => {
	const url = new mw.Title(`Special:Booksources/${
		link.slice(4).replace(/[\p{Zs}\t-]/gu, '').replace(/x$/u, 'X')
	}`).getUrl(undefined);
	open(url, '_blank');
	return true;
};
