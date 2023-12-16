/**
 * @author MusikAnimal and others
 * @license GPL-2.0-or-later
 * @link https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import { HighlightStyle } from '@codemirror/language';
import { Tag, tags as importedTags } from '@lezer/highlight';
import type { StreamParser } from '@codemirror/language';

const tags: Record<string, Tag | ( ( tag: Tag ) => Tag )> = importedTags;

/**
 * Configuration for the MediaWiki highlighting mode for CodeMirror.
 * This is a separate class mainly to keep static configuration out of
 * the logic in CodeMirrorModeMediaWiki.
 */
export const modeConfig = {

	/**
	 * All HTML/XML tags permitted in MediaWiki Core.
	 *
	 * Extensions should use the CodeMirrorTagModes extension attribute to register tags
	 * instead of adding them here.
	 *
	 * @see https://www.mediawiki.org/wiki/Extension:CodeMirror#Extension_integration
	 */
	permittedHtmlTags: {
		b: true,
		bdi: true,
		del: true,
		i: true,
		ins: true,
		u: true,
		font: true,
		big: true,
		small: true,
		sub: true,
		sup: true,
		h1: true,
		h2: true,
		h3: true,
		h4: true,
		h5: true,
		h6: true,
		cite: true,
		code: true,
		em: true,
		s: true,
		strike: true,
		strong: true,
		tt: true,
		var: true,
		div: true,
		center: true,
		blockquote: true,
		q: true,
		ol: true,
		ul: true,
		dl: true,
		table: true,
		caption: true,
		pre: true,
		ruby: true,
		rb: true,
		rp: true,
		rt: true,
		rtc: true,
		p: true,
		span: true,
		abbr: true,
		dfn: true,
		kbd: true,
		samp: true,
		data: true,
		time: true,
		mark: true,
		br: true,
		wbr: true,
		hr: true,
		li: true,
		dt: true,
		dd: true,
		td: true,
		th: true,
		tr: true,
		noinclude: true,
		includeonly: true,
		onlyinclude: true
	},

	/**
	 * HTML tags that are only self-closing.
	 */
	implicitlyClosedHtmlTags: {
		br: true,
		hr: true,
		wbr: true
	} as Record<string, true>,

	/**
	 * Mapping of MediaWiki-esque token identifiers to a standardized lezer highlighting tag.
	 * Values are one of the default highlighting tags. The idea is to use as many default tags as
	 * possible so that theming (such as dark mode) can be applied with minimal effort. The
	 * semantic meaning of the tag may not really match how it is used, but as per CodeMirror docs,
	 * this is fine. It's still better to make use of the standard tags in some way.
	 *
	 * Once we allow use of other themes, we may want to tweak these values for aesthetic reasons.
	 * The values here can freely be changed. The actual CSS class used is defined further down
	 * in highlightStyle().
	 *
	 * @see https://lezer.codemirror.net/docs/ref/#highlight.tags
	 * @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	tags: {
		apostrophes: 'character',
		apostrophesBold: 'strong',
		apostrophesItalic: 'emphasis',
		comment: 'comment',
		doubleUnderscore: 'controlKeyword',
		extLink: 'url',
		extLinkBracket: 'modifier',
		extLinkProtocol: 'namespace',
		extLinkText: 'labelName',
		hr: 'contentSeparator',
		htmlTagAttribute: 'attributeName',
		htmlTagBracket: 'angleBracket',
		htmlTagName: 'tagName',
		extTagAttribute: 'attributeName',
		extTagBracket: 'angleBracket',
		extTagName: 'tagName',
		indenting: 'operatorKeyword',
		linkBracket: 'squareBracket',
		linkDelimiter: 'operator',
		linkText: 'string',
		linkToSection: 'className',
		list: 'list',
		parserFunction: 'unit',
		parserFunctionBracket: 'paren',
		parserFunctionDelimiter: 'punctuation',
		parserFunctionName: 'keyword',
		sectionHeader: 'heading',
		sectionHeader1: 'heading1',
		sectionHeader2: 'heading2',
		sectionHeader3: 'heading3',
		sectionHeader4: 'heading4',
		sectionHeader5: 'heading5',
		sectionHeader6: 'heading6',
		signature: 'quote',
		tableBracket: 'null',
		tableDefinition: 'definitionOperator',
		tableDelimiter: 'typeOperator',
		template: 'attributeValue',
		templateArgumentName: 'definitionKeyword',
		templateBracket: 'bracket',
		templateDelimiter: 'separator',
		templateName: 'moduleKeyword',
		templateVariable: 'atom',
		templateVariableBracket: 'brace',
		templateVariableName: 'variableName',
		section: 'mw-section',
		em: 'mw-em',
		error: 'mw-error',
		extTag: 'mw-exttag',
		extGround: 'mw-ext-ground',
		freeExtLink: 'mw-free-extlink',
		freeExtLinkProtocol: 'mw-free-extlink-protocol',
		link: 'mw-link',
		linkGround: 'mw-link-ground',
		linkPageName: 'mw-link-pagename',
		mnemonic: 'mw-mnemonic',
		pageName: 'mw-pagename',
		skipFormatting: 'mw-skipformatting',
		strong: 'mw-strong',
		tableCaption: 'mw-table-caption',
		templateGround: 'mw-template-ground',
		templateExtGround: 'mw-template-ext-ground',
		templateLinkGround: 'mw-template-link-ground',
		templateVariableDelimiter: 'mw-templatevariable-delimiter',
		template2ExtGround: 'mw-template2-ext-ground',
		template2Ground: 'mw-template2-ground',
		template3ExtGround: 'mw-template3-ext-ground',
		template3Ground: 'mw-template3-ground',
		pre: 'mw-tag-pre',
		nowiki: 'mw-tag-nowiki'
	},

	/**
	 * These are custom tokens (a.k.a. tags) that aren't mapped to any of the standardized tags.
	 * Make sure these are also defined in tags() above.
	 *
	 * @see https://codemirror.net/docs/ref/#language.StreamParser.tokenTable
	 * @see https://lezer.codemirror.net/docs/ref/#highlight.Tag%5Edefine
	 */
	get tokenTable(): Record<string, Tag> {
		return {
			[ this.tags.section ]: Tag.define(),
			[ this.tags.em ]: Tag.define(),
			[ this.tags.error ]: Tag.define(),
			[ this.tags.extTag ]: Tag.define(),
			[ this.tags.extGround ]: Tag.define(),
			[ this.tags.freeExtLink ]: Tag.define(),
			[ this.tags.freeExtLinkProtocol ]: Tag.define(),
			[ this.tags.link ]: Tag.define(),
			[ this.tags.linkGround ]: Tag.define(),
			[ this.tags.linkPageName ]: Tag.define(),
			[ this.tags.mnemonic ]: Tag.define(),
			[ this.tags.pageName ]: Tag.define(),
			[ this.tags.skipFormatting ]: Tag.define(),
			[ this.tags.strong ]: Tag.define(),
			[ this.tags.tableCaption ]: Tag.define(),
			[ this.tags.templateGround ]: Tag.define(),
			[ this.tags.templateExtGround ]: Tag.define(),
			[ this.tags.templateLinkGround ]: Tag.define(),
			[ this.tags.templateVariableDelimiter ]: Tag.define(),
			[ this.tags.template2ExtGround ]: Tag.define(),
			[ this.tags.template2Ground ]: Tag.define(),
			[ this.tags.template3ExtGround ]: Tag.define(),
			[ this.tags.template3Ground ]: Tag.define(),
			[ this.tags.pre ]: Tag.define(),
			[ this.tags.nowiki ]: Tag.define()
		};
	},

	/**
	 * This defines the actual CSS class assigned to each tag/token.
	 * Keep this in sync and in the same order as tags().
	 *
	 * @see https://codemirror.net/docs/ref/#language.TagStyle
	 */
	getHighlightStyle( context: StreamParser<unknown> ): HighlightStyle {
		return HighlightStyle.define( [
			{
				tag: tags[ this.tags.apostrophes ] as Tag,
				class: 'cm-mw-apostrophes'
			},
			{
				tag: tags[ this.tags.apostrophesBold ] as Tag,
				class: 'cm-mw-apostrophes-bold'
			},
			{
				tag: tags[ this.tags.apostrophesItalic ] as Tag,
				class: 'cm-mw-apostrophes-italic'
			},
			{
				tag: tags[ this.tags.comment ] as Tag,
				class: 'cm-mw-comment'
			},
			{
				tag: tags[ this.tags.doubleUnderscore ] as Tag,
				class: 'cm-mw-double-underscore'
			},
			{
				tag: tags[ this.tags.extLink ] as Tag,
				class: 'cm-mw-extlink'
			},
			{
				tag: tags[ this.tags.extLinkBracket ] as Tag,
				class: 'cm-mw-extlink-bracket'
			},
			{
				tag: tags[ this.tags.extLinkProtocol ] as Tag,
				class: 'cm-mw-extlink-protocol'
			},
			{
				tag: tags[ this.tags.extLinkText ] as Tag,
				class: 'cm-mw-extlink-text'
			},
			{
				tag: tags[ this.tags.hr ] as Tag,
				class: 'cm-mw-hr'
			},
			{
				tag: tags[ this.tags.htmlTagAttribute ] as Tag,
				class: 'cm-mw-htmltag-attribute'
			},
			{
				tag: tags[ this.tags.htmlTagBracket ] as Tag,
				class: 'cm-mw-htmltag-bracket'
			},
			{
				tag: tags[ this.tags.htmlTagName ] as Tag,
				class: 'cm-mw-htmltag-name'
			},
			{
				tag: tags[ this.tags.extTagAttribute ] as Tag,
				class: 'cm-mw-exttag-attribute'
			},
			{
				tag: tags[ this.tags.extTagBracket ] as Tag,
				class: 'cm-mw-exttag-bracket'
			},
			{
				tag: tags[ this.tags.extTagName ] as Tag,
				class: 'cm-mw-exttag-name'
			},
			{
				tag: tags[ this.tags.indenting ] as Tag,
				class: 'cm-mw-indenting'
			},
			{
				tag: tags[ this.tags.linkBracket ] as Tag,
				class: 'cm-mw-link-bracket'
			},
			{
				tag: tags[ this.tags.linkDelimiter ] as Tag,
				class: 'cm-mw-link-delimiter'
			},
			{
				tag: tags[ this.tags.linkText ] as Tag,
				class: 'cm-mw-link-text'
			},
			{
				tag: tags[ this.tags.linkToSection ] as Tag,
				class: 'cm-mw-link-tosection'
			},
			{
				tag: tags[ this.tags.list ] as Tag,
				class: 'cm-mw-list'
			},
			{
				tag: tags[ this.tags.parserFunction ] as Tag,
				class: 'cm-mw-parserfunction'
			},
			{
				tag: tags[ this.tags.parserFunctionBracket ] as Tag,
				class: 'cm-mw-parserfunction-bracket'
			},
			{
				tag: tags[ this.tags.parserFunctionDelimiter ] as Tag,
				class: 'cm-mw-parserfunction-delimiter'
			},
			{
				tag: tags[ this.tags.parserFunctionName ] as Tag,
				class: 'cm-mw-parserfunction-name'
			},
			{
				tag: tags[ this.tags.sectionHeader ] as Tag,
				class: 'cm-mw-section-header'
			},
			{
				tag: tags[ this.tags.sectionHeader1 ] as Tag,
				class: 'cm-mw-section-1'
			},
			{
				tag: tags[ this.tags.sectionHeader2 ] as Tag,
				class: 'cm-mw-section-2'
			},
			{
				tag: tags[ this.tags.sectionHeader3 ] as Tag,
				class: 'cm-mw-section-3'
			},
			{
				tag: tags[ this.tags.sectionHeader4 ] as Tag,
				class: 'cm-mw-section-4'
			},
			{
				tag: tags[ this.tags.sectionHeader5 ] as Tag,
				class: 'cm-mw-section-5'
			},
			{
				tag: tags[ this.tags.sectionHeader6 ] as Tag,
				class: 'cm-mw-section-6'
			},
			{
				tag: tags[ this.tags.signature ] as Tag,
				class: 'cm-mw-signature'
			},
			{
				tag: tags[ this.tags.tableBracket ] as Tag,
				class: 'cm-mw-table-bracket'
			},
			{
				tag: tags[ this.tags.tableDefinition ] as Tag,
				class: 'cm-mw-table-definition'
			},
			{
				tag: tags[ this.tags.tableDelimiter ] as Tag,
				class: 'cm-mw-table-delimiter'
			},
			{
				tag: tags[ this.tags.template ] as Tag,
				class: 'cm-mw-template'
			},
			{
				tag: tags[ this.tags.templateArgumentName ] as Tag,
				class: 'cm-mw-template-argument-name'
			},
			{
				tag: tags[ this.tags.templateBracket ] as Tag,
				class: 'cm-mw-template-bracket'
			},
			{
				tag: tags[ this.tags.templateDelimiter ] as Tag,
				class: 'cm-mw-template-delimiter'
			},
			{
				tag: tags[ this.tags.templateName ] as Tag,
				class: 'cm-mw-pagename cm-mw-template-name'
			},
			{
				tag: tags[ this.tags.templateVariable ] as Tag,
				class: 'cm-mw-templatevariable'
			},
			{
				tag: tags[ this.tags.templateVariableBracket ] as Tag,
				class: 'cm-mw-templatevariable-bracket'
			},
			{
				tag: tags[ this.tags.templateVariableName ] as Tag,
				class: 'cm-mw-templatevariable-name'
			},

			/**
			 * Custom tags.
			 * IMPORTANT: These need to reference the CodeMirrorModeMediaWiki context.
			 */
			{
				tag: context.tokenTable![ this.tags.section ]!,
				class: 'cm-mw-section'
			},
			{
				tag: context.tokenTable![ this.tags.em ]!,
				class: 'cm-mw-em'
			},
			{
				tag: context.tokenTable![ this.tags.error ]!,
				class: 'cm-mw-error'
			},
			{
				tag: context.tokenTable![ this.tags.extTag ]!,
				class: 'cm-mw-exttag'
			},
			{
				tag: context.tokenTable![ this.tags.extGround ]!,
				class: 'cm-mw-ext-ground'
			},
			{
				tag: context.tokenTable![ this.tags.freeExtLink ]!,
				class: 'cm-mw-free-extlink'
			},
			{
				tag: context.tokenTable![ this.tags.freeExtLinkProtocol ]!,
				class: 'cm-mw-free-extlink-protocol'
			},
			{
				tag: context.tokenTable![ this.tags.linkGround ]!,
				class: 'cm-mw-link-ground'
			},
			{
				tag: context.tokenTable![ this.tags.linkPageName ]!,
				class: 'cm-mw-link-pagename'
			},
			{
				tag: context.tokenTable![ this.tags.mnemonic ]!,
				class: 'cm-mw-mnemonic'
			},
			{
				tag: context.tokenTable![ this.tags.pageName ]!,
				class: 'cm-mw-pagename'
			},
			{
				tag: context.tokenTable![ this.tags.skipFormatting ]!,
				class: 'cm-mw-skipformatting'
			},
			{
				tag: context.tokenTable![ this.tags.strong ]!,
				class: 'cm-mw-strong'
			},
			{
				tag: context.tokenTable![ this.tags.tableCaption ]!,
				class: 'cm-mw-table-caption'
			},
			{
				tag: context.tokenTable![ this.tags.templateGround ]!,
				class: 'cm-mw-template-ground'
			},
			{
				tag: context.tokenTable![ this.tags.templateExtGround ]!,
				class: 'cm-mw-template-ext-ground'
			},
			{
				tag: context.tokenTable![ this.tags.templateLinkGround ]!,
				class: 'cm-mw-template-link-ground'
			},
			{
				tag: context.tokenTable![ this.tags.templateVariableDelimiter ]!,
				class: 'cm-mw-templatevariable-delimiter'
			},
			{
				tag: context.tokenTable![ this.tags.template2ExtGround ]!,
				class: 'cm-mw-template2-ext-ground'
			},
			{
				tag: context.tokenTable![ this.tags.template2Ground ]!,
				class: 'cm-mw-template2-ground'
			},
			{
				tag: context.tokenTable![ this.tags.template3ExtGround ]!,
				class: 'cm-mw-template3-ext-ground'
			},
			{
				tag: context.tokenTable![ this.tags.template3Ground ]!,
				class: 'cm-mw-template3-ground'
			},
			{
				tag: context.tokenTable![ this.tags.pre ]!,
				class: 'cm-mw-tag-pre'
			},
			{
				tag: context.tokenTable![ this.tags.nowiki ]!,
				class: 'cm-mw-tag-nowiki'
			}
		] );
	}
};
