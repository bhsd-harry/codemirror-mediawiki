import {normalizeTitle} from '@bhsd/browser';
import {autocompleteNamespaces} from '../src/constants';
import {getTypes, hasTag} from '../src/config';
import {isWikiLink} from '../src/mediawiki';
import {sliceDoc, getSubpageLevel} from '../src/util';
import {getParentDir} from './util';
import type {SyntaxNode} from '@lezer/common';
import type {MwConfig, TitleParser} from '../src/token';
import type {TagName} from '../src/config';

const isSameToken = (node: SyntaxNode, name: string): boolean =>
	node.name === name || hasTag(node.name, 'comment');

export const getTitleParser = ({urlProtocols, templateStylesDefaultNamespace = 10}: MwConfig): TitleParser => {
	const re = new RegExp(`^(?:${urlProtocols})`, 'iu');
	return (state, node) => {
		const {name} = node;
		let page = sliceDoc(state, node),
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
		page = page.trim();
		const types = getTypes(name);
		if (hasTag(types, 'fileText') && re.test(page)) {
			return {page};
		}
		let ns = 0;
		if (hasTag(types, 'exttagAttributeValue')) {
			ns = templateStylesDefaultNamespace;
		} else {
			if (hasTag(types, 'templateName')) {
				ns = 10;
			} else if (
				hasTag(types, 'mw-tag-gallery' as TagName) && hasTag(types, 'linkPagename') && !isWikiLink(name)
			) {
				ns = 6;
			} else if (hasTag(types, 'parserfunction')) {
				ns = Number(/mw-function-(-?\d+)/u.exec(name)?.[1] ?? 0);
				if (ns !== 10) {
					page = autocompleteNamespaces[ns as keyof typeof autocompleteNamespaces] + page;
				}
			} else if (hasTag(nextSibling?.name, 'linkTosection')) {
				page += sliceDoc(state, nextSibling!).trim();
			}
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
		return {page: mw.Title.newFromText(normalizeTitle(page), ns)?.getUrl(undefined)};
	};
};
