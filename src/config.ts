/**
 * @file Configuration for the MediaWiki highlighting mode for CodeMirror.
 * @author MusikAnimal and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {tags} from '@lezer/highlight';
import {Tag} from '@lezer/highlight';

/**
 * All HTML/XML tags permitted in MediaWiki Core.
 *
 * @see https://www.mediawiki.org/wiki/Extension:CodeMirror#Extension_integration
 */
export const htmlTags = [
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
		'img',
		'meta',
		'link',
	],

	/** HTML tags that are only self-closing. */
	voidHtmlTags = [
		'br',
		'hr',
		'wbr',
		'img',
		'meta',
		'link',
	],

	/** HTML tags that can be self-closing. */
	selfClosingTags = [
		'li',
		'dt',
		'dd',
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
	tokens = {
		apostrophes: 'mw-apostrophes',
		comment: 'mw-comment',
		convertBracket: 'mw-convert-bracket',
		convertDelimiter: 'mw-convert-delimiter',
		convertFlag: 'mw-convert-flag',
		convertLang: 'mw-convert-lang',
		doubleUnderscore: 'mw-double-underscore',
		em: 'mw-em',
		error: 'mw-error',
		extLink: 'mw-extlink',
		extLinkBracket: 'mw-extlink-bracket',
		extLinkProtocol: 'mw-extlink-protocol',
		extLinkText: 'mw-extlink-text',
		extTag: 'mw-exttag',
		extTagAttribute: 'mw-exttag-attribute',
		extTagAttributeValue: 'mw-exttag-attribute-value',
		extTagBracket: 'mw-exttag-bracket',
		extTagName: 'mw-exttag-name',
		fileText: 'mw-file-text',
		freeExtLink: 'mw-free-extlink',
		freeExtLinkProtocol: 'mw-free-extlink-protocol',
		hr: 'mw-hr',
		htmlEntity: 'mw-entity',
		htmlTagAttribute: 'mw-htmltag-attribute',
		htmlTagAttributeValue: 'mw-htmltag-attribute-value',
		htmlTagBracket: 'mw-htmltag-bracket',
		htmlTagName: 'mw-htmltag-name',
		imageParameter: 'mw-image-parameter',
		linkBracket: 'mw-link-bracket',
		linkDelimiter: 'mw-link-delimiter',
		linkPageName: 'mw-link-pagename',
		linkText: 'mw-link-text',
		linkToSection: 'mw-link-tosection',
		list: 'mw-list',
		magicLink: 'mw-magic-link',
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
		tableDefinitionValue: 'mw-table-definition-value',
		tableDelimiter: 'mw-table-delimiter',
		tableDelimiter2: 'mw-table-delimiter2',
		tableTd: 'mw-table-td',
		tableTh: 'mw-table-th',
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
	tokenTable = (() => {
		const table: Record<string, Tag> = {
			variable: tags.variableName,
			'variable-2': tags.special(tags.variableName),
			'string-2': tags.special(tags.string),
			def: tags.definition(tags.variableName),
			tag: tags.tagName,
			attribute: tags.attributeName,
			type: tags.typeName,
			builtin: tags.standard(tags.variableName),
			qualifier: tags.modifier,
			error: tags.invalid,
			header: tags.heading,
			property: tags.propertyName,
		};
		for (const className of Object.values(tokens)) {
			table[className] = Tag.define();
		}
		return table;
	})(),

	/** Common HTML attributes permitted in MediaWiki Core. */
	htmlAttrs = [
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

	/** HTML attributes that are only permitted on certain HTML tags. */
	elementAttrs = {
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

	/** HTML attributes that are only permitted on certain extension tags. */
	extAttrs = {
		indicator: ['name'],
		langconvert: ['from', 'to'],
		ref: ['group', 'name', 'extends', 'follow', 'dir'],
		references: ['group', 'responsive'],
		charinsert: ['label'],
		templatestyles: ['src', 'wrapper'],
	};
