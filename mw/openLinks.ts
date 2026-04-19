import {normalizeTitle} from '@bhsd/browser';
import {tokens} from '../src/config';
import {isWikiLink} from '../src/mediawiki';
import {sliceDoc, getSubpageLevel} from '../src/util';
import {getParentDir} from './util';
import type {SyntaxNode} from '@lezer/common';
import type {MwConfig} from '../src/token';

const isSameToken = (node: SyntaxNode, name: string): boolean =>
	node.name === name || node.name.includes(tokens.comment);

export const getTitleParser = ({urlProtocols}: MwConfig): MwConfig['titleParser'] => {
	const re = new RegExp(`^(?:${urlProtocols})`, 'iu');
	return (state, node) => {
		const {name} = node;
		let page = sliceDoc(state, node).trim(),
			{prevSibling, nextSibling, from, to} = node;
		while (prevSibling?.to === from && isSameToken(prevSibling, name)) {
			if (prevSibling.name === name) {
				page = sliceDoc(state, prevSibling) + page;
			}
			({from, prevSibling} = prevSibling);
		}
		while (nextSibling?.from === to && isSameToken(nextSibling, name)) {
			if (nextSibling.name === name) {
				page += sliceDoc(state, nextSibling);
			}
			({to, nextSibling} = nextSibling);
		}
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
