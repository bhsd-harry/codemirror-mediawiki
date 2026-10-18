/**
 * @file Configuration for the MediaWiki highlighting mode for CodeMirror.
 * @author MusikAnimal and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {
	Tag,
} from '@lezer/highlight';
import {html} from 'wikiparser-node/config/default.json';

const tagNames = [
	'apostrophes',
	'comment',
	'convertBracket',
	'convertDelimiter',
	'convertFlag',
	'convertLang',
	'doubleUnderscore',
	'em',
	'entity',
	'error',
	'extlink',
	'extlinkBracket',
	'extlinkProtocol',
	'extlinkText',
	'exttag',
	'exttagAttribute',
	'exttagAttributeValue',
	'exttagBracket',
	'exttagName',
	'fileDelimiter',
	'fileText',
	'freeExtlink',
	'freeExtlinkProtocol',
	'hr',
	'htmltagAttribute',
	'htmltagAttributeValue',
	'htmltagBracket',
	'htmltagName',
	'ignored',
	'imageParameter',
	'linkBracket',
	'linkDelimiter',
	'linkPagename',
	'linkText',
	'linkTosection',
	'list',
	'magicLink',
	'pagename',
	'parserfunction',
	'parserfunctionArgumentName',
	'parserfunctionBracket',
	'parserfunctionDelimiter',
	'parserfunctionName',
	'redirect',
	'section',
	'sectionHeader',
	'signature',
	'skipformatting',
	'strong',
	'tableBracket',
	'tableCaption',
	'tableDefinition',
	'tableDefinitionValue',
	'tableDelimiter',
	'tableDelimiter2',
	'tableTd',
	'tableTh',
	'template',
	'templateArgumentName',
	'templateBracket',
	'templateDelimiter',
	'templateName',
	'templatevariable',
	'templatevariableBracket',
	'templatevariableDelimiter',
	'templatevariableName',
] as const;

export type TagName = (typeof tagNames)[number];

/**
 * All HTML/XML tags permitted in MediaWiki Core.
 *
 * @see https://www.mediawiki.org/wiki/Extension:CodeMirror#Extension_integration
 */
export const htmlTags = /* #__PURE__ */ html.flat(),

	/** HTML tags that are only self-closing. */
	voidHtmlTags = /* #__PURE__ */ (() => html[2]!)(),

	/** HTML tags that can be self-closing. */
	selfClosingTags = /* #__PURE__ */ (() => html[1]!)();

/**
 * Mapping of MediaWiki-esque token identifiers to a standardized lezer highlighting tag.
 * Values are one of the default highlighting tags.
 *
 * Once we allow use of other themes, we may want to tweak these values for aesthetic reasons.
 *
 * @see https://lezer.codemirror.net/docs/ref/#highlight.tags
 * @internal
 */
export const tokens = /* #__PURE__ */ (() => {
	const table = {} as Record<TagName, string>;
	for (const tagName of tagNames) {
		table[tagName] = `mw-${tagName.replaceAll(/[A-Z]/gu, c => `-${c.toLowerCase()}`)}`;
	}
	return table;
})();

/**
 * These are custom tokens (a.k.a. tags) that aren't mapped to any of the standardized tags.
 *
 * @see https://codemirror.net/docs/ref/#language.StreamParser.tokenTable
 * @see https://lezer.codemirror.net/docs/ref/#highlight.Tag%5Edefine
 */
export const tokenTable = /* #__PURE__ */ (() => {
	const table: Record<string, Tag | Tag[]> = {};
	for (const className of Object.values(tokens)) {
		table[className] = Tag.define();
	}
	return table;
})();

/**
 * 从节点名称中获取节点类型集合
 * @param name 节点名称
 */
export const getTypes = (name: string): Set<string> => new Set(name.split('_'));

/**
 * 判断节点是否包含指定类型
 * @param types 节点类型
 * @param names 指定类型
 * @test
 */
export const hasTag = (types: Set<string> | string | undefined, names: TagName | TagName[]): boolean => {
	if (!types) {
		return false;
	} else if (typeof types === 'string') {
		types = getTypes(types);
	}
	return (Array.isArray(names) ? names : [names])
		.some(name => types.has(Object.hasOwn(tokens, name) ? tokens[name] : name));
};
