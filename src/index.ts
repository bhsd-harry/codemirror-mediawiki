import {
	keymap,
	highlightSpecialChars,
	highlightActiveLine,
	highlightWhitespace,
	highlightTrailingWhitespace,
	scrollPastEnd,
	drawSelection,
	rectangularSelection,
	crosshairCursor,
} from '@codemirror/view';
import {EditorState} from '@codemirror/state';
import {highlightSelectionMatches} from '@codemirror/search';
import {
	closeBrackets,
	autocompletion,
	acceptCompletion,
	completionKeymap,
	startCompletion,
} from '@codemirror/autocomplete';
import {json} from '@codemirror/lang-json';
import {autoCloseTags} from '@codemirror/lang-html';
import {css as cssParser} from '@codemirror/legacy-modes/mode/css';
import {getLSP} from '@bhsd/browser';
import {colorPicker as cssColorPicker, colorPickerTheme, makeColorPicker} from '@bhsd/codemirror-css-color-picker';
import colorPicker, {discoverColors} from './color';
import {mediawiki, html, FullMediaWiki} from './mediawiki';
import escape from './escape';
import codeFolding, {mediaWikiFold, foldHandler} from './fold';
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
import bracketMatching from './matchBrackets';
import statusBar from './statusBar';
import {detectIndent} from './indent';
import javascript from './javascript';
import css from './css';
import lua from './lua';
import vue from './vue';
import {CodeMirror6, avail, languages, linterRegistry, destroyListeners, plain, optionalFunctions} from './codemirror';
import type {Extension} from '@codemirror/state';
import type {Config, LanguageSupport} from '@codemirror/language';
import type {StyleSpec} from 'style-mod';
import type {MwConfig} from './token';
import type {LintSourceGetter} from './lintsource';
import type {Addon, AddonMain} from './codemirror';

export type {MwConfig};
export {CodeMirror6};

/**
 * 注册通用扩展
 * @param name 扩展名
 * @param ext 扩展
 */
const registerExtension = <T = Extension>(name: string, ext: AddonMain<T>): void => {
	avail[name] ??= [] as unknown as Addon<T>;
	const addon = avail[name] as Addon<T>;
	addon[0] = ext;
};

/** Register the `highlightSpecialChars` extension */
export const registerHighlightSpecialChars = (): void => {
	registerExtension('highlightSpecialChars', highlightSpecialChars);
};

/** Register the `highlightActiveLine` extension */
export const registerHighlightActiveLine = (): void => {
	registerExtension('highlightActiveLine', highlightActiveLine);
};

/** Register the `highlightWhitespace` extension */
export const registerHighlightWhitespace = (): void => {
	registerExtension('highlightWhitespace', highlightWhitespace);
};

/** Register the `highlightTrailingWhitespace` extension */
export const registerHighlightTrailingWhitespace = (): void => {
	registerExtension('highlightTrailingWhitespace', highlightTrailingWhitespace);
};

/** Register the `highlightSelectionMatches` extension */
export const registerHighlightSelectionMatches = (): void => {
	registerExtension('highlightSelectionMatches', highlightSelectionMatches);
};

/** Register the `bracketMatching` extension */
export const registerBracketMatching = (): void => {
	registerExtension('bracketMatching', ([config, e = []]: [Config?, Extension?] = []): Extension => [
		bracketMatching(config),
		e,
	]);
};

/** Register the `closeBrackets` extension */
export const registerCloseBrackets = (): void => {
	registerExtension('closeBrackets', (e: Extension = []): Extension => [closeBrackets(), e]);
};

/** Register the `scrollPastEnd` extension */
export const registerScrollPastEnd = (): void => {
	registerExtension('scrollPastEnd', scrollPastEnd);
};

/** Register the `allowMultipleSelections` extension */
export const registerAllowMultipleSelections = (): void => {
	registerExtension('allowMultipleSelections', (): Extension => [
		EditorState.allowMultipleSelections.of(true),
		drawSelection(),
		rectangularSelection(),
		crosshairCursor(),
	]);
};

/** Register the `autocompletion` extension */
export const registerAutocompletion = (): void => {
	registerExtension('autocompletion', (): Extension => [
		autocompletion({defaultKeymap: false}),
		keymap.of([
			...completionKeymap.filter(({run}) => run !== startCompletion),
			{key: 'Shift-Enter', run: startCompletion},
			{key: 'Tab', run: acceptCompletion},
		]),
	]);
};

/** Register the `codeFolding` extension */
export const registerCodeFolding = (): void => {
	registerExtension('codeFolding', codeFolding);
};

/** Register the `colorPicker` extension */
export const registerColorPicker = (): void => {
	registerExtension('colorPicker', colorPicker);
};

/** 注册所有通用扩展（除`colorPicker`） */
const registerExtensions = (): void => {
	highlightSpecialChars();
	registerHighlightActiveLine();
	registerHighlightWhitespace();
	registerHighlightTrailingWhitespace();
	registerHighlightSelectionMatches();
	registerBracketMatching();
	registerCloseBrackets();
	registerScrollPastEnd();
	registerAllowMultipleSelections();
	registerAutocompletion();
	registerCodeFolding();
};

/** Register all common extensions */
export const registerCommonExtensions = (): void => {
	registerExtensions();
	registerColorPicker();
};

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
	registerCommonExtensions();
	registerMediaWikiCore();
	registerOpenLinks();
	registerEscape();
	registerRefHover();
	registerHover();
	registerSignatureHelp();
	registerInlayHints();
	registerColorPickerForMediaWiki();
	registerBracketMatchingForMediaWiki();
	registerCodeFoldingForMediaWiki();
};

/**
 * 注册MediaWiki专用扩展
 * @param name 扩展名
 * @param ext 扩展
 */
const registerExtensionForMediaWiki = (name: string, ext: Extension | ((cm: CodeMirror6) => Extension)): void => {
	avail[name] ??= mediawikiOnly(ext as Extension);
};

/** Register the `openLinks` extension */
export const registerOpenLinks = (): void => {
	registerExtensionForMediaWiki('openLinks', openLinks);
};

/** Register the `escape` extension */
export const registerEscape = (): void => {
	registerExtensionForMediaWiki('escape', escape);
};

/** Register the `refHover` extension */
export const registerRefHover = (): void => {
	registerExtensionForMediaWiki('refHover', refHover);
};

/** Register the `hover` extension */
export const registerHover = (): void => {
	registerExtensionForMediaWiki('hover', magicWordHover);
};

/** Register the `signatureHelp` extension */
export const registerSignatureHelp = (): void => {
	registerExtensionForMediaWiki('signatureHelp', signatureHelp);
};

/** Register the `inlayHints` extension */
export const registerInlayHints = (): void => {
	registerExtensionForMediaWiki('inlayHints', inlayHints);
};

/** Register the `colorPicker` extension for MediaWiki */
export const registerColorPickerForMediaWiki = (): void => {
	registerLangExtension<[Extension, StyleSpec]>('mediawiki', 'colorPicker', [
		[makeColorPicker({discoverColors}), colorPickerTheme],
		{marginLeft: '0.6ch'},
	]);
};

/** Register the `bracketMatching` extension for MediaWiki */
export const registerBracketMatchingForMediaWiki = (): void => {
	registerLangExtension<[Config, Extension]>('mediawiki', 'bracketMatching', [
		{brackets: '()[]{}（）【】［］｛｝'},
		tagMatchingState,
	]);
};

/** Register the `codeFolding` extension for MediaWiki */
export const registerCodeFoldingForMediaWiki = (): void => {
	registerLangExtension('mediawiki', 'codeFolding', mediaWikiFold);
	optionalFunctions.foldHandler = foldHandler;
};

/**
 * 注册LintSource
 * @param lang 语言
 * @param lintSource
 */
const registerLintSource = (lang: string, lintSource: LintSourceGetter): void => {
	linterRegistry[lang] = lintSource;
	optionalFunctions.statusBar = statusBar;
};

/** Register MediaWiki core language support */
export const registerMediaWikiCore = (): void => {
	CodeMirror6.getMwConfig = (config): MwConfig => getStaticMwConfig(config, tagModes);
	languages['mediawiki'] = (config: MwConfig): Extension => [
		mediawiki(config),
		plain(),
		bidiIsolation,
		toolKeymap,
	];
	registerLintSource('mediawiki', getWikiLintSource);
	destroyListeners.push(view => getLSP(view)?.destroy());
};

/** Register mixed MediaWiki-HTML language support */
export const registerHTML = (): void => {
	registerCommonExtensions();
	registerHTMLCore();
};

/** Register HTML core language support */
export const registerHTMLCore = (): void => {
	Object.assign(FullMediaWiki.prototype, {
		css() {
			return cssParser;
		},
	});
	languages['html'] = html;
};

/** Register JavaScript language support */
export const registerJavaScript = (): void => {
	registerExtensions();
	registerJavaScriptCore();
};

/** Register JavaScript core language support */
export const registerJavaScriptCore = (): void => {
	languages['javascript'] = javascript;
	registerLintSource('javascript', getJsLintSource);
	optionalFunctions.detectIndent = detectIndent;
};

/** Register CSS language support */
export const registerCSS = (): void => {
	registerCommonExtensions();
	registerCSSCore();
	registerColorPickerForCSS();
};

/** Register the `colorPicker` extension for CSS */
export const registerColorPickerForCSS = (): void => {
	registerLangExtension<[Extension]>('css', 'colorPicker', [cssColorPicker]);
};

/** Register CSS core language support */
export const registerCSSCore = (): void => {
	languages['css'] = css;
	registerLintSource('css', getCssLintSource);
	optionalFunctions.detectIndent = detectIndent;
};

/** Register JSON language support */
export const registerJSON = (): void => {
	registerExtensions();
	registerJSONCore();
};

/** Register JSON core language support */
export const registerJSONCore = (): void => {
	languages['json'] = json;
	registerLintSource('json', getJsonLintSource);
	optionalFunctions.detectIndent = detectIndent;
};

/** Register Lua language support */
export const registerLua = (): void => {
	registerExtensions();
	registerLuaCore();
};

/** Register Lua core language support */
export const registerLuaCore = (): void => {
	languages['lua'] = lua;
	registerLintSource('lua', getLuaLintSource);
	optionalFunctions.detectIndent = detectIndent;
};

/** Register Vue language support */
export const registerVue = (): void => {
	registerCommonExtensions();
	registerVueCore();
	registerCloseBracketsForVue();
	registerColorPickerForVue();
};

/** Register the `closeBrackets` extension for Vue */
export const registerCloseBracketsForVue = (): void => {
	registerLangExtension('vue', 'closeBrackets', autoCloseTags);
};

/** Register the `colorPicker` extension for Vue */
export const registerColorPickerForVue = (): void => {
	registerLangExtension<[Extension]>('vue', 'colorPicker', [cssColorPicker]);
};

/** Register Vue core language support */
export const registerVueCore = (): void => {
	languages['vue'] = vue;
	registerLintSource('vue', getVueLintSource);
	optionalFunctions.detectIndent = detectIndent;
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
	registerCommonExtensions();
	registerLanguageCore(name, lang, lintSource);
};

/**
 * Register a custom language support without common extensions
 * @param name language name
 * @param lang language support
 * @param lintSource optional linter
 */
export const registerLanguageCore = (
	name: string,
	lang: (config?: unknown) => LanguageSupport,
	lintSource?: LintSourceGetter,
): void => {
	languages[name] = lang;
	if (lintSource) {
		registerLintSource(name, lintSource);
	}
};
