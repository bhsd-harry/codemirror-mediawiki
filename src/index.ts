import {json} from '@codemirror/lang-json';
import {autoCloseTags} from '@codemirror/lang-html';
import {css as cssParser} from '@codemirror/legacy-modes/mode/css';
import {getLSP} from '@bhsd/browser';
import {colorPicker as cssColorPicker, colorPickerTheme, makeColorPicker} from '@bhsd/codemirror-css-color-picker';
import {discoverColors} from './color';
import {mediawiki, html, FullMediaWiki} from './mediawiki';
import escape from './escape';
import {mediaWikiFold} from './fold';
import tagMatchingState from './matchTag';
import refHover from './ref';
import magicWordHover from './hover';
import signatureHelp from './signature';
import inlayHints from './inlay';
import {
	getWikiLintSource,
	getJsLintSource,
	getCssLintSource,
	getJsonLintSource,
	getLuaLintSource,
	getVueLintSource,
} from './lintsource';
import openLinks from './openLinks';
import {tagModes, getStaticMwConfig} from './static';
import bidiIsolation from './bidi';
import toolKeymap from './keymap';
import javascript from './javascript';
import css from './css';
import lua from './lua';
import vue from './vue';
import {CodeMirror6, avail, languages, linterRegistry, destroyListeners, plain} from './codemirror';
import type {Extension} from '@codemirror/state';
import type {Config, LanguageSupport} from '@codemirror/language';
import type {StyleSpec} from 'style-mod';
import type {MwConfig} from './token';
import type {LintSourceGetter} from './lintsource';
import type {Addon} from './codemirror';

export type {MwConfig};
export {CodeMirror6};

/**
 * 仅供mediawiki模式的扩展
 * @param ext 扩展
 */
function mediawikiOnly(ext: Extension): Addon<Extension>;
function mediawikiOnly(ext: (cm: CodeMirror6) => Extension): Addon<boolean>;
function mediawikiOnly(ext: Extension | ((cm: CodeMirror6) => Extension)): Addon<Extension> | Addon<boolean> {
	return typeof ext === 'function'
		? [(enable: boolean, cm): Extension => enable ? ext(cm!) : [], {mediawiki: true}] as Addon<boolean>
		: [(e: Extension = []): Extension => e, {mediawiki: ext}];
}

/**
 * 注册特定语言的扩展
 * @param lang 语言
 * @param name 扩展名
 * @param ext 扩展
 */
const registerLangExtension = <T = Extension>(lang: string, name: string, ext: T): void => {
	avail[name] ??= [(): Extension => []] satisfies Addon<T>;
	const addon = avail[name] as Addon<T>;
	addon[1] ??= {};
	addon[1][lang] = ext;
};

/** Register MediaWiki language support */
export const registerMediaWiki = (): void => {
	CodeMirror6.getMwConfig = (config): MwConfig => getStaticMwConfig(config, tagModes);
	languages['mediawiki'] = (config: MwConfig): Extension => [
		mediawiki(config),
		plain(),
		bidiIsolation,
		toolKeymap,
	];
	registerLangExtension<[Extension, StyleSpec]>('mediawiki', 'colorPicker', [
		[makeColorPicker({discoverColors}), colorPickerTheme],
		{marginLeft: '0.6ch'},
	]);
	registerLangExtension<[Config, Extension]>('mediawiki', 'bracketMatching', [
		{brackets: '()[]{}（）【】［］｛｝'},
		tagMatchingState,
	]);
	registerLangExtension('mediawiki', 'codeFolding', mediaWikiFold);
	Object.assign(avail, {
		openLinks: mediawikiOnly(openLinks),
		escape: mediawikiOnly(escape),
		refHover: mediawikiOnly(refHover),
		hover: mediawikiOnly(magicWordHover),
		signatureHelp: mediawikiOnly(signatureHelp),
		inlayHints: mediawikiOnly(inlayHints),
	});
	linterRegistry['mediawiki'] = getWikiLintSource;
	destroyListeners.push(view => getLSP(view)?.destroy());
};

/** Register mixed MediaWiki-HTML language support */
export const registerHTML = (): void => {
	Object.assign(FullMediaWiki.prototype, {
		css() {
			return cssParser;
		},
	});
	languages['html'] = html;
};

/** Register JavaScript language support */
export const registerJavaScript = (): void => {
	languages['javascript'] = javascript;
	linterRegistry['javascript'] = getJsLintSource;
};

/** Register CSS language support */
export const registerCSS = (): void => {
	languages['css'] = css;
	registerLangExtension<[Extension]>('css', 'colorPicker', [cssColorPicker]);
	linterRegistry['css'] = getCssLintSource;
};

/** Register JSON language support */
export const registerJSON = (): void => {
	languages['json'] = json;
	linterRegistry['json'] = getJsonLintSource;
};

/** Register Lua language support */
export const registerLua = (): void => {
	languages['lua'] = lua;
	linterRegistry['lua'] = getLuaLintSource;
};

/** Register Vue language support */
export const registerVue = (): void => {
	languages['vue'] = vue;
	registerLangExtension('vue', 'closeBrackets', autoCloseTags);
	registerLangExtension<[Extension]>('vue', 'colorPicker', [cssColorPicker]);
	linterRegistry['vue'] = getVueLintSource;
};

/**
 * Register a custom language support
 * @param name language name
 * @param lang language support
 * @param lintSource optional linter
 */
export const registerLanguage = (
	name: string,
	lang: (config?: unknown) => LanguageSupport,
	lintSource?: LintSourceGetter,
): void => {
	languages[name] = lang;
	if (lintSource) {
		linterRegistry[name] = lintSource;
	}
};
