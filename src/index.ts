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
import {EditorState, Prec} from '@codemirror/state';
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
import {abusefilter, analyzer} from '@bhsd/lezer-abusefilter';
import {getLSP} from '@bhsd/browser';
import {colorPicker} from '@bhsd/codemirror-css-color-picker';
import bidiIsolates from './bidi.js';
import closeTags from './closeTags.js';
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
import codeFolding, {mediawikiFold, foldHandler} from './fold.js';
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
import {
	mediawikiBase,
} from './mediawiki.js';
import openLinks from './openLinks.js';
import refHover from './ref.js';
import signatureHelpBase from './signature.js';
import {tagModes, getStaticMwConfig} from './static.js';
import statusBar from './statusBar.js';
import css from './css.js';
import html from './html.js';
import javascript, {exclude} from './javascript.js';
import lua from './lua.js';
import vue from './vue.js';
import type {EditorView} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {
	LanguageSupport,
} from '@codemirror/language';
import type {Addon, AddonMain} from './codemirror';
import type {LintSourceGetter, LintSource} from './lintsource';
import type {MwConfig} from './token';
import type {BracketConfig} from './matchBrackets';

export type {MwConfig};
export {CodeMirror6};

const getOrInsert = <T>(name: string, ext: Addon<T>): Addon<T> => {
	if (!avail.has(name)) {
		avail.set(name, ext);
	}
	return avail.get(name) as Addon<T>;
};

/**
 * 注册通用扩展
 * @param name 扩展名
 * @param ext 扩展
 */
const registerExtension = <T = Extension>(name: string, ext: AddonMain<T>): void => {
	const addon = getOrInsert<T>(name, [] as unknown as Addon<T>);
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
	registerExtension('bracketMatching', ([config, e = []]: [BracketConfig?, Extension?] = []): Extension => [
		bracketMatchingBase(config),
		e,
	]);
};

/** Register the `closeBrackets` extension */
export const registerCloseBrackets = (): void => {
	registerExtension('closeBrackets', closeBrackets);
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
		Prec.high(keymap.of([
			...completionKeymap.filter(({run}) => run !== startCompletion),
			{key: 'Shift-Enter', run: startCompletion},
			{key: 'Tab', run: acceptCompletion},
		])),
	]);
};

/** Register the `codeFolding` extension */
export const registerCodeFolding = (): void => {
	registerExtension('codeFolding', codeFolding);
};

/**
 * Register the `colorPicker` extension
 * @deprecated This function does nothing and will be removed in a future release
 */
export const registerColorPicker = (): void => {};

/** Register all common extensions */
export const registerCommonExtensions = (): void => {
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

/**
 * 各语言独立定义的扩展
 * @param e 扩展
 */
const langExtension = (e: Extension = []): Extension => e;

/**
 * 仅供mediawiki模式的扩展
 * @param ext 扩展
 */
function mediawikiOnly(ext: Extension): Addon<Extension>;
function mediawikiOnly(ext: (cm: CodeMirror6) => Extension): Addon<boolean>;
function mediawikiOnly(ext: Extension | ((cm: CodeMirror6) => Extension)): Addon<Extension> | Addon<boolean> {
	return typeof ext === 'function'
		? [
			((enable: boolean | undefined, cm): Extension => enable ? ext(cm!) : []) satisfies AddonMain<boolean>,
			new Map([['mediawiki', true]]),
		]
		: [langExtension, new Map([['mediawiki', ext]])];
}

/**
 * 注册特定语言的扩展
 * @param lang 语言
 * @param name 扩展名
 * @param ext 扩展
 */
const registerLangExtension = <T = Extension>(lang: string, name: string, ext: T): void => {
	const addon = getOrInsert<T>(name, [langExtension] as Addon<T>);
	addon[1] ??= new Map();
	addon[1].set(lang, ext);
};

/**
 * Register MediaWiki language support
 * @param articlePath article path (e.g., 'https://www.mediawiki.org/wiki/')
 * @param templatedata whether to use [Extension:TemplateData](https://www.mediawiki.org/wiki/Extension:TemplateData)
 * for template hover information; enabled by default
 */
export const registerMediaWiki = (articlePath?: string, templatedata?: boolean): void => {
	registerCommonExtensions();
	registerMediaWikiCore(articlePath, templatedata);
	registerOpenLinks(articlePath);
	registerEscape(articlePath);
	registerRefHover(articlePath);
	registerHover(articlePath, templatedata);
	registerSignatureHelp(articlePath);
	registerInlayHints(articlePath);
	registerColorPickerForMediaWiki();
	registerBracketMatchingForMediaWiki();
	registerCodeFoldingForMediaWiki();
	registerCloseTagsForMediaWiki();
};

/**
 * 注册MediaWiki专用扩展
 * @param name 扩展名
 * @param ext 扩展
 */
const registerExtensionForMediaWiki = (name: string, ext: Extension | ((cm: CodeMirror6) => Extension)): void => {
	getOrInsert<Extension>(name, mediawikiOnly(ext as Extension));
};

/**
 * Register the `openLinks` extension
 * @param articlePath article path (e.g., 'https://www.mediawiki.org/wiki/')
 */
export const registerOpenLinks = (articlePath?: string): void => {
	registerExtensionForMediaWiki('openLinks', openLinks(articlePath));
};

/**
 * Register the `escape` extension
 * @param articlePath article path (e.g., 'https://www.mediawiki.org/wiki/')
 */
export const registerEscape = (articlePath?: string): void => {
	registerExtensionForMediaWiki('escape', escapeKeymap(articlePath));
};

/**
 * Register the `refHover` extension
 * @param articlePath article path (e.g., 'https://www.mediawiki.org/wiki/')
 */
export const registerRefHover = (articlePath?: string): void => {
	registerExtensionForMediaWiki('refHover', refHover(articlePath));
};

/**
 * Register the `hover` extension
 * @param articlePath article path (e.g., 'https://www.mediawiki.org/wiki/')
 * @param templatedata whether to use [Extension:TemplateData](https://www.mediawiki.org/wiki/Extension:TemplateData)
 * for template information; enabled by default
 */
export const registerHover = (articlePath?: string, templatedata?: boolean): void => {
	registerExtensionForMediaWiki('hover', magicWordHover(articlePath, templatedata));
};

/**
 * Register the `signatureHelp` extension
 * @param articlePath article path (e.g., 'https://www.mediawiki.org/wiki/')
 */
export const registerSignatureHelp = (articlePath?: string): void => {
	registerExtensionForMediaWiki('signatureHelp', signatureHelpBase(articlePath));
};

/**
 * Register the `inlayHints` extension
 * @param articlePath article path (e.g., 'https://www.mediawiki.org/wiki/')
 */
export const registerInlayHints = (articlePath?: string): void => {
	registerExtensionForMediaWiki('inlayHints', inlayHints(articlePath));
};

/** Register the `bidiIsolates` extension */
export const registerBidiIsolates = (): void => {
	registerExtensionForMediaWiki('bidiIsolates', bidiIsolates);
};

/** Register the `colorPicker` extension for MediaWiki */
export const registerColorPickerForMediaWiki = (): void => {
	registerLangExtension('mediawiki', 'colorPicker', mediawikiColorPicker);
};

/** Register the `bracketMatching` extension for MediaWiki */
export const registerBracketMatchingForMediaWiki = (): void => {
	registerLangExtension<[BracketConfig, Extension]>('mediawiki', 'bracketMatching', [
		{brackets: '()[]{}（）【】［］｛｝'},
		tagMatchingState,
	]);
};

/** Register the `codeFolding` extension for MediaWiki */
export const registerCodeFoldingForMediaWiki = (): void => {
	registerLangExtension('mediawiki', 'codeFolding', mediawikiFold);
	optionalFunctions.foldHandler = foldHandler;
};

/** Register the `closeTags` extension for MediaWiki */
export const registerCloseTagsForMediaWiki = (): void => {
	registerLangExtension('mediawiki', 'closeTags', closeTags());
};

/**
 * 注册LintSource
 * @param lang 语言
 * @param lintSource
 */
const registerLintSource = (lang: string, lintSource: LintSourceGetter): void => {
	linterRegistry.set(lang, lintSource);
	optionalFunctions.statusBar = statusBar;
};

/**
 * Register MediaWiki core language support
 * @param articlePath article path (e.g., 'https://www.mediawiki.org/wiki/')
 * @param templatedata whether to use [Extension:TemplateData](https://www.mediawiki.org/wiki/Extension:TemplateData)
 * for template parameter autocompletion
 */
export const registerMediaWikiCore = (articlePath?: string, templatedata?: boolean): void => {
	CodeMirror6.getMwConfig = (config): MwConfig => getStaticMwConfig(config, tagModes);
	languages.set('mediawiki', (config: MwConfig): Extension => [
		mediawikiBase(config, templatedata),
		plain(),
		keymap.of(formatKeymap),
	]);
	registerLintSource('mediawiki', getWikiLintSource(articlePath));
	destroyListeners.push(view => {
		if (typeof wikiparse === 'object' && wikiparse.LanguageService) {
			void getLSP(view)?.destroy();
		}
	});
};

/** Register mixed MediaWiki-HTML language support */
export const registerHTML = (): void => {
	registerCommonExtensions();
	registerHTMLCore();
	registerBracketMatchingForHTML();
	registerCloseTagsForHTML();
	registerColorPickerForHTML();
};

/** Register the `bracketMatching` extension for mixed MediaWiki-HTML */
export const registerBracketMatchingForHTML = (): void => {
	registerLangExtension<[BracketConfig, Extension]>('html', 'bracketMatching', [
		{exclude},
		tagMatchingState,
	]);
};

/**
 * Register the `closeBrackets` extension for mixed MediaWiki-HTML
 * @deprecated This function does nothing and will be removed in a future release
 */
export const registerCloseBracketsForHTML = (): void => {};

/** Register the `closeTags` extension for mixed MediaWiki-HTML */
export const registerCloseTagsForHTML = (): void => {
	registerLangExtension('html', 'closeTags', autoCloseTags);
};

/** Register the `colorPicker` extension for mixed MediaWiki-HTML */
export const registerColorPickerForHTML = (): void => {
	registerLangExtension('html', 'colorPicker', colorPicker);
};

/** Register mixed MediaWiki-HTML core language support */
export const registerHTMLCore = (): void => {
	languages.set('html', html);
	registerLintSource('html', getHTMLLintSource);
	optionalFunctions.detectIndent = detectIndent;
};

/** Register JavaScript language support */
export const registerJavaScript = (): void => {
	registerCommonExtensions();
	registerJavaScriptCore();
	registerBracketMatchingForJavaScript();
};

/** Register the `bracketMatching` extension for JavaScript */
export const registerBracketMatchingForJavaScript = (): void => {
	registerLangExtension<[BracketConfig]>('javascript', 'bracketMatching', [{exclude}]);
};

/** Register JavaScript core language support */
export const registerJavaScriptCore = (): void => {
	languages.set('javascript', javascript);
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
	languages.set('css', css);
	registerLintSource('css', getCssLintSource);
	optionalFunctions.detectIndent = detectIndent;
};

/** Register JSON language support */
export const registerJSON = (): void => {
	registerCommonExtensions();
	registerJSONCore();
};

/** Register JSON core language support */
export const registerJSONCore = (): void => {
	languages.set('json', json);
	registerLintSource('json', getJsonLintSource);
	optionalFunctions.detectIndent = detectIndent;
};

/** Register Lua language support */
export const registerLua = (): void => {
	registerCommonExtensions();
	registerLuaCore();
};

/** Register Lua core language support */
export const registerLuaCore = (): void => {
	languages.set('lua', lua);
	registerLintSource('lua', getLuaLintSource);
	optionalFunctions.detectIndent = detectIndent;
};

/** Register Vue language support */
export const registerVue = (): void => {
	registerCommonExtensions();
	registerVueCore();
	registerBracketMatchingForVue();
	registerCloseTagsForVue();
	registerColorPickerForVue();
};

/** Register the `bracketMatching` extension for Vue */
export const registerBracketMatchingForVue = (): void => {
	registerLangExtension<[BracketConfig]>('vue', 'bracketMatching', [{exclude}]);
};

/**
 * Register the `closeBrackets` extension for Vue
 * @deprecated This function does nothing and will be removed in a future release
 */
export const registerCloseBracketsForVue = (): void => {};

/** Register the `closeTags` extension for Vue */
export const registerCloseTagsForVue = (): void => {
	registerLangExtension('vue', 'closeTags', autoCloseTags);
};

/** Register the `colorPicker` extension for Vue */
export const registerColorPickerForVue = (): void => {
	registerLangExtension('vue', 'colorPicker', colorPicker);
};

/** Register Vue core language support */
export const registerVueCore = (): void => {
	languages.set('vue', vue);
	registerLintSource('vue', getVueLintSource);
	optionalFunctions.detectIndent = detectIndent;
};

/** Register AbuseFilter language support */
export const registerAbuseFilter = (): void => {
	registerCommonExtensions();
	registerAbuseFilterCore();
};

/** Register AbuseFilter core language support */
export const registerAbuseFilterCore = (): void => {
	languages.set('abusefilter', abusefilter);
	registerLintSource('abusefilter', (): LintSource => state => analyzer({state} as EditorView));
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
	languages.set(name, lang);
	if (lintSource) {
		registerLintSource(name, lintSource);
	}
};

export const registerTheme = (name: string, theme: Extension): void => {
	themes.set(name, theme);
};

export {nordDark as nord} from './theme.js';
