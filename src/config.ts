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
		apostrophesBold: 'mw-apostrophes-bold',
		apostrophesItalic: 'mw-apostrophes-italic',
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
		sectionHeader1: 'mw-section-1',
		sectionHeader2: 'mw-section-2',
		sectionHeader3: 'mw-section-3',
		sectionHeader4: 'mw-section-4',
		sectionHeader5: 'mw-section-5',
		sectionHeader6: 'mw-section-6',
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
		extGround: 'mw-ext-ground',
		ext2Ground: 'mw-ext2-ground',
		ext2LinkGround: 'mw-ext2-link-ground',
		ext3Ground: 'mw-ext3-ground',
		ext3LinkGround: 'mw-ext3-link-ground',
		extLinkGround: 'mw-ext-link-ground',
		extTag: 'mw-exttag',
		extTagAttribute: 'mw-exttag-attribute',
		extTagBracket: 'mw-exttag-bracket',
		extTagName: 'mw-exttag-name',
		freeExtLink: 'mw-free-extlink',
		freeExtLinkProtocol: 'mw-free-extlink-protocol',
		htmlEntity: 'mw-html-entity',
		linkGround: 'mw-link-ground',
		linkPageName: 'mw-link-pagename',
		pageName: 'mw-pagename',
		skipFormatting: 'mw-skipformatting',
		strong: 'mw-strong',
		tableCaption: 'mw-table-caption',
		templateExtGround: 'mw-template-ext-ground',
		templateExt2Ground: 'mw-template-ext2-ground',
		templateExt2LinkGround: 'mw-template-ext2-link-ground',
		templateExt3Ground: 'mw-template-ext3-ground',
		templateExt3LinkGround: 'mw-template-ext3-link-ground',
		templateExtLinkGround: 'mw-template-ext-link-ground',
		templateGround: 'mw-template-ground',
		templateLinkGround: 'mw-template-link-ground',
		templateVariableDelimiter: 'mw-templatevariable-delimiter',
		template2ExtGround: 'mw-template2-ext-ground',
		template2Ext2Ground: 'mw-template2-ext2-ground',
		template2Ext3Ground: 'mw-template2-ext3-ground',
		templatet2Ext2LinkGround: 'mw-template2-ext2-link-ground',
		template2Ext3LinkGround: 'mw-template2-ext3-link-ground',
		template2ExtLinkGround: 'mw-template2-ext-link-ground',
		template2Ground: 'mw-template2-ground',
		template2LinkGround: 'mw-template2-link-ground',
		template3ExtGround: 'mw-template3-ext-ground',
		template3Ext2Ground: 'mw-template3-ext2-ground',
		template3Ext3Ground: 'mw-template3-ext3-ground',
		template3ExtLinkGround: 'mw-template3-ext-link-ground',
		template3Ext2LinkGround: 'mw-template3-ext2-link-ground',
		template3Ext3LinkGround: 'mw-template3-ext3-link-ground',
		template3Ground: 'mw-template3-ground',
		template3LinkGround: 'mw-template3-link-ground',
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
