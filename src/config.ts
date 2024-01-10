/**
 * @author MusikAnimal and others
 * @license GPL-2.0-or-later
 * @link https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import { Tag } from '@lezer/highlight';
import type { TagStyle } from '@codemirror/language';
import type { StreamParser } from '@codemirror/language';

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
		indenting: 'mw-indenting',
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
		extTag: 'mw-exttag',
		extTagAttribute: 'mw-exttag-attribute',
		extTagBracket: 'mw-exttag-bracket',
		extTagName: 'mw-exttag-name',
		freeExtLink: 'mw-free-extlink',
		freeExtLinkProtocol: 'mw-free-extlink-protocol',
		htmlEntity: 'mw-html-entity',
		link: 'mw-link',
		linkGround: 'mw-link-ground',
		linkPageName: 'mw-link-pagename',
		pageName: 'mw-pagename',
		skipFormatting: 'mw-skipformatting',
		strong: 'mw-strong',
		tableCaption: 'mw-table-caption',
		templateExtGround: 'mw-template-ext-ground',
		templateGround: 'mw-template-ground',
		templateLinkGround: 'mw-template-link-ground',
		templateVariableDelimiter: 'mw-templatevariable-delimiter',
		template2ExtGround: 'mw-template2-ext-ground',
		template2Ground: 'mw-template2-ground',
		template3ExtGround: 'mw-template3-ext-ground',
		template3Ground: 'mw-template3-ground'
	},

	/**
	 * These are custom tokens (a.k.a. tags) that aren't mapped to any of the standardized tags.
	 * Make sure these are also defined in tags() above.
	 *
	 * TODO: pass parent Tags in Tag.define() where appropriate for better theming.
	 *
	 * @see https://codemirror.net/docs/ref/#language.StreamParser.tokenTable
	 * @see https://lezer.codemirror.net/docs/ref/#highlight.Tag%5Edefine
	 */
	get tokenTable(): Record<string, Tag> {
		const table: Record<string, Tag> = {};
		for ( const className of Object.values( this.tags ) ) {
			table[ className ] = Tag.define();
		}
		return table;
	},

	/**
	 * This defines the actual CSS class assigned to each tag/token.
	 * Keep this in sync and in the same order as tags().
	 *
	 * @see https://codemirror.net/docs/ref/#language.TagStyle
	 */
	getTagStyles( context: StreamParser<unknown> ): TagStyle[] {
		return Object.values( this.tags ).map( ( className ) => ( {

			/**
			 * Custom tags.
			 * IMPORTANT: These need to reference the CodeMirrorModeMediaWiki context.
			 */
			tag: context.tokenTable![ className ]!,
			class: `cm-${ className }${ className === 'templateName' ? ' cm-mw-pagename' : '' }`
		} ) );
	}
};
