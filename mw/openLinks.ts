import {normalizeTitle} from '@bhsd/browser';
import {tokens} from '../src/config';
import {isWikiLink} from '../src/mediawiki';
import {sliceDoc, getSubpageLevel} from '../src/util';
import {getParentDir} from './util';
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
		if (!isTemplateStyles) {
			const pageName = mw.config.get('wgPageName');
			if (page.startsWith('/')) {
				page = `:${pageName}${page}`;
			} else if (page.startsWith('../')) {
				const length = getSubpageLevel(page),
					parent = getParentDir(pageName, length);
				if (!parent) {
					return undefined;
				}
				const sub = page.slice(length);
				page = `:${parent}${sub && '/'}${sub}`;
			}
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
