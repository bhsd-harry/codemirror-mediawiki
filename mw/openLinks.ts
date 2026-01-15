import {normalizeTitle} from '@bhsd/browser';
import {tokens} from '../src/config';
import {isWikiLink} from '../src/mediawiki';
import {sliceDoc} from '../src/util';
import type {MwConfig} from '../src/token';

export const getTitleParser = ({urlProtocols}: MwConfig): MwConfig['titleParser'] => {
	const re = new RegExp(`^(?:${urlProtocols})`, 'iu');
	return (state, node) => {
		const {name, nextSibling} = node;
		let page = sliceDoc(state, node).trim();
		if (name.includes(tokens.fileText) && re.test(page)) {
			return page;
		}
		const isTemplateStyles = name.includes(tokens.extTagAttributeValue);
		if (!isTemplateStyles && page.startsWith('/')) {
			page = `:${mw.config.get('wgPageName')}${page}`;
		}
		let ns = 0;
		if (isTemplateStyles || name.includes(tokens.templateName)) {
			ns = 10;
		} else if (
			name.includes('mw-tag-gallery') && name.includes(tokens.linkPageName) && !isWikiLink(name)
		) {
			ns = 6;
		} else if (name.includes(tokens.parserFunction)) {
			ns = Number(/mw-function-(\d+)/u.exec(name)?.[1] ?? 0);
		} else if (nextSibling?.name.includes(tokens.linkToSection)) {
			page += sliceDoc(state, nextSibling).trim();
		}
		return mw.Title.newFromText(normalizeTitle(page), ns)?.getUrl(undefined);
	};
};

export const isbnParser = (link: string): string => new mw.Title(`Special:Booksources/${
	link.slice(4).replace(/[\p{Zs}\t-]/gu, '').replace(/x$/u, 'X')
}`).getUrl(undefined);
