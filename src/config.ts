/**
 * @author MusikAnimal and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {Tag} from '@lezer/highlight';

/**
 * Configuration for the MediaWiki highlighting mode for CodeMirror.
 */
export const modeConfig = {

	/**
	 * All HTML/XML tags permitted in MediaWiki Core.
	 *
	 * @see https://www.mediawiki.org/wiki/Extension:CodeMirror#Extension_integration
	 */
	permittedHtmlTags: [
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
	implicitlyClosedHtmlTags: [
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
	tags: {
		apostrophes: 'mw-apostrophes',
		comment: 'mw-comment',
		doubleUnderscore: 'mw-double-underscore',
		extLink: 'mw-extlink',
		extLinkBracket: 'mw-extlink-bracket',
		extLinkProtocol: 'mw-extlink-protocol',
		extLinkText: 'mw-extlink-text',
		hr: 'mw-hr',
		htmlTagAttribute: 'mw-htmltag-attribute',
		htmlTagBracket: 'mw-htmltag-bracket',
		htmlTagName: 'mw-htmltag-name',
		linkBracket: 'mw-link-bracket',
		linkDelimiter: 'mw-link-delimiter',
		linkText: 'mw-link-text',
		linkToSection: 'mw-link-tosection',
		list: 'mw-list',
		parserFunction: 'mw-parserfunction',
		parserFunctionBracket: 'mw-parserfunction-bracket',
		parserFunctionDelimiter: 'mw-parserfunction-delimiter',
		parserFunctionName: 'mw-parserfunction-name',
		sectionHeader: 'mw-section-header',
		signature: 'mw-signature',
		tableBracket: 'mw-table-bracket',
		tableDefinition: 'mw-table-definition',
		tableDelimiter: 'mw-table-delimiter',
		template: 'mw-template',
		templateArgumentName: 'mw-template-argument-name',
		templateBracket: 'mw-template-bracket',
		templateDelimiter: 'mw-template-delimiter',
		templateName: 'mw-template-name',
		templateVariable: 'mw-templatevariable',
		templateVariableBracket: 'mw-templatevariable-bracket',
		templateVariableName: 'mw-templatevariable-name',
		section: 'mw-section',
		em: 'mw-em',
		error: 'mw-error',
		extTag: 'mw-exttag',
		extTagAttribute: 'mw-exttag-attribute',
		extTagBracket: 'mw-exttag-bracket',
		extTagName: 'mw-exttag-name',
		freeExtLink: 'mw-free-extlink',
		freeExtLinkProtocol: 'mw-free-extlink-protocol',
		htmlEntity: 'mw-html-entity',
		linkPageName: 'mw-link-pagename',
		pageName: 'mw-pagename',
		skipFormatting: 'mw-skipformatting',
		strong: 'mw-strong',
		tableCaption: 'mw-table-caption',
		templateVariableDelimiter: 'mw-templatevariable-delimiter',
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
		for (const className of Object.values(this.tags)) {
			table[className] = Tag.define();
		}
		return table;
	},
};
