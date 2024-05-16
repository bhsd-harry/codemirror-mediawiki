/**
 * @author MusikAnimal and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {Tag} from '@lezer/highlight';

/**
 * Configuration for the MediaWiki highlighting mode for CodeMirror.
 */
const modeConfig = {

	/**
	 * All HTML/XML tags permitted in MediaWiki Core.
	 *
	 * @see https://www.mediawiki.org/wiki/Extension:CodeMirror#Extension_integration
	 */
	htmlTags: [
		'b',
		'bdi',
		'bdo',
		'del',
		'i',
		'ins',
		'u',
		'font',
		'big',
		'small',
		'sub',
		'sup',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'cite',
		'code',
		'em',
		's',
		'strike',
		'strong',
		'tt',
		'var',
		'div',
		'center',
		'blockquote',
		'q',
		'ol',
		'ul',
		'dl',
		'table',
		'caption',
		'pre',
		'ruby',
		'rb',
		'rp',
		'rt',
		'rtc',
		'p',
		'span',
		'abbr',
		'dfn',
		'kbd',
		'samp',
		'data',
		'time',
		'mark',
		'br',
		'wbr',
		'hr',
		'li',
		'dt',
		'dd',
		'td',
		'th',
		'tr',
		'noinclude',
		'includeonly',
		'onlyinclude',
		'img',
		'meta',
		'link',
	],

	/**
	 * HTML tags that are only self-closing.
	 */
	voidHtmlTags: [
		'br',
		'hr',
		'wbr',
		'img',
		'meta',
		'link',
	],

	/**
	 * Mapping of MediaWiki-esque token identifiers to a standardized lezer highlighting tag.
	 * Values are one of the default highlighting tags.
	 *
	 * Once we allow use of other themes, we may want to tweak these values for aesthetic reasons.
	 *
	 * @see https://lezer.codemirror.net/docs/ref/#highlight.tags
	 * @internal
	 */
	tokens: {
		apostrophes: 'mw-apostrophes',
		apostrophesLink: 'mw-apostrophes-link',
		comment: 'mw-comment',
		doubleUnderscore: 'mw-double-underscore',
		em: 'mw-em',
		error: 'mw-error',
		extLink: 'mw-extlink',
		extLinkBracket: 'mw-extlink-bracket',
		extLinkProtocol: 'mw-extlink-protocol',
		extLinkText: 'mw-extlink-text',
		extTag: 'mw-exttag',
		extTagAttribute: 'mw-exttag-attribute',
		extTagBracket: 'mw-exttag-bracket',
		extTagName: 'mw-exttag-name',
		freeExtLink: 'mw-free-extlink',
		freeExtLinkProtocol: 'mw-free-extlink-protocol',
		hr: 'mw-hr',
		htmlEntity: 'mw-entity',
		htmlTagAttribute: 'mw-htmltag-attribute',
		htmlTagBracket: 'mw-htmltag-bracket',
		htmlTagName: 'mw-htmltag-name',
		imageParameter: 'mw-image-parameter',
		linkBracket: 'mw-link-bracket',
		linkDelimiter: 'mw-link-delimiter',
		linkPageName: 'mw-link-pagename',
		linkText: 'mw-link-text',
		linkToSection: 'mw-link-tosection',
		list: 'mw-list',
		pageName: 'mw-pagename',
		parserFunction: 'mw-parserfunction',
		parserFunctionBracket: 'mw-parserfunction-bracket',
		parserFunctionDelimiter: 'mw-parserfunction-delimiter',
		parserFunctionName: 'mw-parserfunction-name',
		redirect: 'mw-redirect',
		section: 'mw-section',
		sectionHeader: 'mw-section-header',
		signature: 'mw-signature',
		skipFormatting: 'mw-skipformatting',
		strong: 'mw-strong',
		tableBracket: 'mw-table-bracket',
		tableCaption: 'mw-table-caption',
		tableDefinition: 'mw-table-definition',
		tableDelimiter: 'mw-table-delimiter',
		template: 'mw-template',
		templateArgumentName: 'mw-template-argument-name',
		templateBracket: 'mw-template-bracket',
		templateDelimiter: 'mw-template-delimiter',
		templateName: 'mw-template-name',
		templateVariable: 'mw-templatevariable',
		templateVariableBracket: 'mw-templatevariable-bracket',
		templateVariableDelimiter: 'mw-templatevariable-delimiter',
		templateVariableName: 'mw-templatevariable-name',
	},

	/**
	 * These are custom tokens (a.k.a. tags) that aren't mapped to any of the standardized tags.
	 *
	 * @todo pass parent Tags in Tag.define() where appropriate for better theming.
	 * @see https://codemirror.net/docs/ref/#language.StreamParser.tokenTable
	 * @see https://lezer.codemirror.net/docs/ref/#highlight.Tag%5Edefine
	 */
	get tokenTable(): Record<string, Tag> {
		const table: Record<string, Tag> = {};
		for (const className of Object.values(this.tokens)) {
			table[className] = Tag.define();
		}
		return table;
	},

	htmlAttrs: [
		'id',
		'class',
		'style',
		'lang',
		'dir',
		'title',
		'aria-describedby',
		'aria-flowto',
		'aria-hidden',
		'aria-label',
		'aria-labelledby',
		'aria-level',
		'aria-owns',
		'role',
		'about',
		'property',
		'resource',
		'datatype',
		'typeof',
		'itemid',
		'itemprop',
		'itemref',
		'itemscope',
		'itemtype',
	],

	elementAttrs: {
		table: ['border'],
		td: ['abbr', 'headers', 'rowspan', 'colspan'],
		th: ['abbr', 'headers', 'rowspan', 'colspan', 'scope'],
		blockquote: ['cite'],
		q: ['cite'],
		ins: ['cite', 'datetime'],
		del: ['cite', 'datetime'],
		time: ['datetime'],
		ol: ['start', 'reversed', 'type'],
		li: ['value'],
		img: ['src', 'alt', 'width', 'height', 'srcset'],
		rt: ['rbspan'],
		data: ['value'],
		meta: ['itemprop', 'content'],
		link: ['itemprop', 'href', 'title'],
		gallery: ['mode', 'showfilename', 'caption', 'perrow', 'widths', 'heights', 'showthumbnails', 'type'],
		poem: ['compact', 'align'],
	},

	extAttrs: {
		indicator: ['name'],
		langconvert: ['from', 'to'],
		ref: ['group', 'name', 'extends', 'follow', 'dir'],
		references: ['group', 'responsive'],
		charinsert: ['label'],
		templatestyles: ['src', 'wrapper'],
	},
};

export default modeConfig;
