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
	autocompletion,
	closeBrackets,
	acceptCompletion,
	completionKeymap,
	startCompletion,
} from '@codemirror/autocomplete';
import {json} from '@codemirror/lang-json';
import {autoCloseTags} from '@codemirror/lang-html';
import {getLSP} from '@bhsd/browser';
import {colorPicker} from '@bhsd/codemirror-css-color-picker';
import bidiIsolation from './bidi.js';
import {
	CodeMirror6,
	avail,
	languages,
	linterRegistry,
	destroyListeners,
	plain,
	optionalFunctions,
	themes,
} from './codemirror.js';
import mediawikiColorPicker from './color.js';
import escapeKeymap from './escape.js';
import codeFolding, {mediaWikiFold, foldHandler} from './fold.js';
import magicWordHover from './hover.js';
import {detectIndent} from './indent.js';
import inlayHints from './inlay.js';
import formatKeymap from './keymap.js';
import {
	getWikiLintSource,
	getJsLintSource,
	getCssLintSource,
	getJsonLintSource,
	getLuaLintSource,
	getVueLintSource,
	getHTMLLintSource,
} from './lintsource.js';
import bracketMatchingBase from './matchBrackets.js';
import tagMatchingState from './matchTag.js';
import {mediawikiBase} from './mediawiki.js';
import openLinks from './openLinks.js';
import refHover from './ref.js';
import signatureHelp from './signature.js';
import {tagModes, getStaticMwConfig} from './static.js';
import statusBar from './statusBar.js';
import css from './css.js';
import html from './html.js';
import javascript from './javascript.js';
import lua from './lua.js';
import vue from './vue.js';
import type {Extension} from '@codemirror/state';
import type {
	Config,
	LanguageSupport,
} from '@codemirror/language';
import type {Addon, AddonMain} from './codemirror';
import type {LintSourceGetter} from './lintsource';
import type {MwConfig} from './token';

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
		bracketMatchingBase(config),
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
	registerExtension('colorPicker', (e: Extension = []): Extension => e);
};

/** 注册所有通用扩展（除`colorPicker`） */
const registerExtensions = (): void => {
	registerHighlightSpecialChars();
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
	registerExtensionForMediaWiki('escape', escapeKeymap);
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
	registerLangExtension('mediawiki', 'colorPicker', mediawikiColorPicker());
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
		mediawikiBase(config),
		plain(),
		bidiIsolation,
		formatKeymap,
	];
	registerLintSource('mediawiki', getWikiLintSource);
	destroyListeners.push(view => {
		if (typeof wikiparse === 'object' && wikiparse.LanguageService) {
			getLSP(view)?.destroy();
		}
	});
};

/** Register mixed MediaWiki-HTML language support */
export const registerHTML = (): void => {
	registerCommonExtensions();
	registerHTMLCore();
	registerCloseBracketsForHTML();
	registerColorPickerForHTML();
};

/** Register the `closeBrackets` extension for mixed MediaWiki-HTML */
export const registerCloseBracketsForHTML = (): void => {
	registerLangExtension('html', 'closeBrackets', autoCloseTags);
};

/** Register the `colorPicker` extension for mixed MediaWiki-HTML */
export const registerColorPickerForHTML = (): void => {
	registerLangExtension('html', 'colorPicker', colorPicker);
};

/** Register mixed MediaWiki-HTML core language support */
export const registerHTMLCore = (): void => {
	languages['html'] = html;
	registerLintSource('html', getHTMLLintSource);
	optionalFunctions.detectIndent = detectIndent;
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
	registerLangExtension('css', 'colorPicker', colorPicker);
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
	registerLangExtension('vue', 'colorPicker', colorPicker);
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

export const registerTheme = (name: string, theme: Extension): void => {
	themes[name] = theme;
};

export {nord} from './theme.js';
