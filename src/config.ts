/**
 * @file Configuration for the MediaWiki highlighting mode for CodeMirror.
 * @author MusikAnimal and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {
	Tag,
	tags,
} from '@lezer/highlight';
import {html} from 'wikiparser-node/config/default.json';

/**
 * All HTML/XML tags permitted in MediaWiki Core.
 *
 * @see https://www.mediawiki.org/wiki/Extension:CodeMirror#Extension_integration
 */
export const htmlTags = /* @__PURE__ */ html.flat(),

	/** HTML tags that are only self-closing. */
	voidHtmlTags = /* @__PURE__ */ (() => html[2]!)(),

	/** HTML tags that can be self-closing. */
	selfClosingTags = /* @__PURE__ */ (() => html[1]!)(),

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
		fileDelimiter: 'mw-file-delimiter',
		fileText: 'mw-file-text',
		freeExtLink: 'mw-free-extlink',
		freeExtLinkProtocol: 'mw-free-extlink-protocol',
		hr: 'mw-hr',
		htmlEntity: 'mw-entity',
		htmlTagAttribute: 'mw-htmltag-attribute',
		htmlTagAttributeValue: 'mw-htmltag-attribute-value',
		htmlTagBracket: 'mw-htmltag-bracket',
		htmlTagName: 'mw-htmltag-name',
		ignored: 'mw-ignored',
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
	};

export type TagName = keyof typeof tokens;

/**
 * These are custom tokens (a.k.a. tags) that aren't mapped to any of the standardized tags.
 *
 * @see https://codemirror.net/docs/ref/#language.StreamParser.tokenTable
 * @see https://lezer.codemirror.net/docs/ref/#highlight.Tag%5Edefine
 */
export const tokenTable = /* @__PURE__ */ (() => {
	const table: Record<string, Tag> = {
		//
	};
	const highlight = new Map<Tag, TagName[]>([
		[tags.strong, ['section', 'strong', 'tableCaption', 'tableTh']],
		[tags.link, ['pageName']],
		[tags.emphasis, ['em']],
		// #940
		[tags.comment, ['comment', 'ignored']],
		// #f00
		[tags.invalid, ['error']],
		// #a11
		[tags.character, ['htmlEntity']],
		// #404740
		[tags.processingInstruction, ['apostrophes', 'list', 'sectionHeader', 'signature', 'hr']],
		// #219
		[tags.labelName, ['redirect', 'doubleUnderscore']],
		// #708
		[tags.operatorKeyword, ['parserFunctionName', 'parserFunctionBracket', 'parserFunctionDelimiter']],
		// #00f
		[tags.definition(tags.variableName), ['templateName', 'templateDelimiter', 'templateBracket']],
		// #256
		[tags.special(tags.variableName), ['templateArgumentName']],
		// #30a
		[
			tags.local(tags.variableName),
			['templateVariableName', 'templateVariableBracket', 'templateVariableDelimiter'],
		],
		// #085
		[tags.tagName, ['extTagName', 'extTagBracket', 'htmlTagName', 'htmlTagBracket']],
		// #e40
		[tags.special(tags.string), ['tableBracket', 'tableDelimiter', 'tableDelimiter2']],
		// #00c
		[
			tags.definition(tags.attributeName),
			['extTagAttribute', 'htmlTagAttribute', 'tableDefinition', 'imageParameter'],
		],
		// #a11
		[tags.attributeValue, ['extTagAttributeValue', 'htmlTagAttributeValue', 'tableDefinitionValue']],
		// #219
		[
			tags.url,
			[
				'linkPageName',
				'linkBracket',
				'linkDelimiter',
				'linkToSection',
				'fileDelimiter',
				'magicLink',
				'extLink',
				'extLinkProtocol',
				'extLinkBracket',
				'freeExtLink',
				'freeExtLinkProtocol',
			],
		],
		// #164
		[tags.literal, ['convertBracket', 'convertDelimiter', 'convertFlag']],
		// #00c
		[tags.definition(tags.propertyName), ['convertLang']],
	]);
	for (const [tag, types] of highlight) {
		for (const type of types) {
			table[tokens[type]] = tag;
		}
	}
	for (const className of Object.values(tokens)) {
		if (!(className in table)) {
			table[className] = Tag.define();
		}
	}
	return table;
})();
