[![npm version](https://badge.fury.io/js/@bhsd%2Fcodemirror-mediawiki.svg)](https://www.npmjs.com/package/@bhsd/codemirror-mediawiki)
[![jsDelivr hits (npm scoped)](https://img.shields.io/jsdelivr/npm/hm/%40bhsd/codemirror-mediawiki)](https://www.npmjs.com/package/@bhsd/codemirror-mediawiki)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/972fd5f6684c4fd8ac2f26e01d349948)](https://app.codacy.com/gh/bhsd-harry/codemirror-mediawiki/dashboard)

# @bhsd/codemirror-mediawiki

This repository contains a modified version of the frontend scripts and styles from [MediaWiki extension CodeMirror](https://www.mediawiki.org/wiki/Extension:CodeMirror). The goal is to support a standalone integration between [CodeMirror](https://codemimrror.net) and [Wikitext](https://www.mediawiki.org/wiki/Wikitext), without the need for a [MediaWiki environment](https://doc.wikimedia.org/mediawiki-core/master/js/).

Here is a [demo](https://bhsd-harry.github.io/codemirror-mediawiki). To experiment with the RTL (right-to-left) support, you can append `?rtl=1` to the URL.

Nonetheless, this repository also provides a customized version with additional functionality for use on a MediaWiki site. Browser editing tools such as [Wikiplus-highlight](https://www.npmjs.com/package/wikiplus-highlight) and an [InPageEdit plugin](https://github.com/inpageedit/Plugins/blob/master/src/plugins/code-mirror/cm6.js) are built upon it. Please refer to a separate [README](./mw/README.md) file for the information.

<details>
	<summary>Expand</summary>

- [Installation](#installation)
- [Browser Usage](#browser-usage)
- [Language modes](#language-modes)
	- [css](#css)
	- [html](#html)
	- [javascript](#javascript)
	- [json](#json)
	- [lua](#lua)
	- [mediawiki](#mediawiki)
	- [vue](#vue)
	- [Other languages](#other-languages)
- [Themes](#themes)
	- [light](#light)
	- [nord](#nord)
	- [Other themes](#other-themes)
- [Constructor](#constructor)
- [Accessors](#accessors)
	- [dialect](#dialect)
	- [lang](#lang)
	- [textarea](#textarea)
	- [view](#view)
	- [visible](#visible)
- [Methods](#methods)
	- [destroy](#destroy)
	- [extraKeys](#extrakeys)
	- [getLinter](#getlinter)
	- [getNodeAt](#getnodeat)
	- [initialize](#initialize)
	- [lint](#lint)
	- [localize](#localize)
	- [prefer](#prefer)
	- [scrollTo](#scrollto)
	- [setContent](#setcontent)
	- [setIndent](#setindent)
	- [setLanguage](#setlanguage)
	- [setLineWrapping](#setlinewrapping)
	- [setTheme](#settheme)
	- [toggle](#toggle)
	- [update](#update)
- [Static methods](#static-methods)
	- [getMwConfig](#getmwconfig)
	- [replaceSelections](#replaceselections)
- [Extensions](#extensions)
	- [allowMultipleSelections](#allowmultipleselections)
	- [autocompletion](#autocompletion)
	- [bracketMatching](#bracketmatching)
	- [closeBrackets](#closebrackets)
	- [codeFolding](#codefolding)
	- [colorPicker](#colorpicker)
	- [escape](#escape)
	- [highlightActiveLine](#highlightactiveline)
	- [highlightSelectionMatches](#highlightselectionmatches)
	- [highlightSpecialChars](#highlightspecialchars)
	- [highlightTrailingWhitespace](#highlighttrailingwhitespace)
	- [highlightWhitespace](#highlightwhitespace)
	- [hover](#hover)
	- [inlayHints](#inlayhints)
	- [openLinks](#openlinks)
	- [refHover](#refhover)
	- [scrollPastEnd](#scrollpastend)
	- [signatureHelp](#signaturehelp)
- [Known issues](#known-issues)
	- [Syntax Highlighting](#syntax-highlighting)

</details>

# Installation

You can install the package via npm and import it as a module:

```bash
npm install @bhsd/codemirror-mediawiki
```

```js
import {
	CodeMirror6,
	registerMediaWiki,
	registerHTML,
	registerCSS,
	registerJavaScript,
	registerJSON,
	registerLua,
	registerVue,
} from '@bhsd/codemirror-mediawiki';
```

# Browser Usage

<details>
	<summary>Expand</summary>

You can download the code via CDN, for example:

```js
// static import
import {
	CodeMirror6,
	registerMediaWiki,
	registerHTML,
	registerCSS,
	registerJavaScript,
	registerJSON,
	registerLua,
	registerVue,
} from 'https://cdn.jsdelivr.net/npm/@bhsd/codemirror-mediawiki';
```

or

```js
import {
	CodeMirror6,
	registerMediaWiki,
	registerHTML,
	registerCSS,
	registerJavaScript,
	registerJSON,
	registerLua,
	registerVue,
} from 'https://unpkg.com/@bhsd/codemirror-mediawiki';
```

or

```js
// dynamic import
const {
	CodeMirror6,
	registerMediaWiki,
	registerHTML,
	registerCSS,
	registerJavaScript,
	registerJSON,
	registerLua,
	registerVue,
} = await import('https://cdn.jsdelivr.net/npm/@bhsd/codemirror-mediawiki');
```

or

```js
const {
	CodeMirror6,
	registerMediaWiki,
	registerHTML,
	registerCSS,
	registerJavaScript,
	registerJSON,
	registerLua,
	registerVue,
} = await import('https://unpkg.com/@bhsd/codemirror-mediawiki');
```

</details>

# Language modes

## css

<details>
	<summary>Expand</summary>

The CSS mode contains a [dialect](#dialect) for [Extension:TemplateStyles](https://www.mediawiki.org/wiki/Extension:TemplateStyles). You can bundle the CSS mode by importing the `registerCSS` function:

```js
import {registerCSS} from '@bhsd/codemirror-mediawiki';
registerCSS();
```

If you want a more granular control over the extensions, you can import the `registerCSSCore` function and the desired extensions:

```js
import {registerCSSCore} from '@bhsd/codemirror-mediawiki';
registerCSSCore();
```

In addition to the common [extensions](#extensions), here are some CSS-specific extensions. Note that these extensions may not take effect if the corresponding common extensions are not registered:

```js
import {registerColorPickerForCSS} from '@bhsd/codemirror-mediawiki';
registerColorPickerForCSS();
```

</details>

## html

<details>
	<summary>Expand</summary>

This is a mixed MediaWiki-HTML mode, which is used for [Extension:Widgets](https://www.mediawiki.org/wiki/Extension:Widgets). You can bundle the HTML mode by importing the `registerHTML` function:

```js
import {registerHTML} from '@bhsd/codemirror-mediawiki';
registerHTML();
```

If you want a more granular control over the extensions, you can import the `registerHTMLCore` function and the desired extensions:

```js
import {registerHTMLCore} from '@bhsd/codemirror-mediawiki';
registerHTMLCore();
```

In addition to the common [extensions](#extensions), here are some HTML-specific extensions. Note that these extensions may not take effect if the corresponding common extensions are not registered:

```js
import {
	registerCloseBracketsForHTML,
	registerColorPickerForHTML,
} from '@bhsd/codemirror-mediawiki';
registerCloseBracketsForHTML();
registerColorPickerForHTML();
```

</details>

## javascript

<details>
	<summary>Expand</summary>

You can bundle the JavaScript mode by importing the `registerJavaScript` function:

```js
import {registerJavaScript} from '@bhsd/codemirror-mediawiki';
registerJavaScript();
```

If you want a more granular control over the extensions, you can import the `registerJavaScriptCore` function and the desired extensions:

```js
import {registerJavaScriptCore} from '@bhsd/codemirror-mediawiki';
registerJavaScriptCore();
```

</details>

## json

<details>
	<summary>Expand</summary>

You can bundle the JSON mode by importing the `registerJSON` function:

```js
import {registerJSON} from '@bhsd/codemirror-mediawiki';
registerJSON();
```

If you want a more granular control over the extensions, you can import the `registerJSONCore` function and the desired extensions:

```js
import {registerJSONCore} from '@bhsd/codemirror-mediawiki';
registerJSONCore();
```

</details>

## lua

<details>
	<summary>Expand</summary>

You can bundle the Lua mode by importing the `registerLua` function:

```js
import {registerLua} from '@bhsd/codemirror-mediawiki';
registerLua();
```

If you want a more granular control over the extensions, you can import the `registerLuaCore` function and the desired extensions:

```js
import {registerLuaCore} from '@bhsd/codemirror-mediawiki';
registerLuaCore();
```

</details>

## mediawiki

<details>
	<summary>Expand</summary>

You can bundle the MediaWiki mode by importing the `registerMediaWiki` function:

```js
import {registerMediaWiki} from '@bhsd/codemirror-mediawiki';
registerMediaWiki();
```

If you want a more granular control over the extensions, you can import the `registerMediaWikiCore` function and the desired extensions:

```js
import {registerMediaWikiCore} from '@bhsd/codemirror-mediawiki';
registerMediaWikiCore();
```

In addition to the common [extensions](#extensions), here are some MediaWiki-specific extensions. Note that these extensions may not take effect if the corresponding common extensions are not registered:

```js
import {
	registerColorPickerForMediaWiki,
	registerBracketMatchingForMediaWiki,
	registerCodeFoldingForMediaWiki
} from '@bhsd/codemirror-mediawiki';
registerColorPickerForMediaWiki();
registerBracketMatchingForMediaWiki();
registerCodeFoldingForMediaWiki();
```

</details>

## vue

<details>
	<summary>Expand</summary>

You can bundle the Vue mode by importing the `registerVue` function:

```js
import {registerVue} from '@bhsd/codemirror-mediawiki';
registerVue();
```

If you want a more granular control over the extensions, you can import the `registerVueCore` function and the desired extensions:

```js
import {registerVueCore} from '@bhsd/codemirror-mediawiki';
registerVueCore();
```

In addition to the common [extensions](#extensions), here are some Vue-specific extensions. Note that these extensions may not take effect if the corresponding common extensions are not registered:

```js
import {
	registerCloseBracketsForVue,
	registerColorPickerForVue,
} from '@bhsd/codemirror-mediawiki';
registerCloseBracketsForVue();
registerColorPickerForVue();
```

</details>

## Other languages

<details>
	<summary>Expand</summary>

You can also register other languages by importing the `registerLanguage` function:

```js
import {registerLanguage} from '@bhsd/codemirror-mediawiki';
import {python} from '@codemirror/lang-python';
registerLanguage('python', python);
```

If you want a more granular control over the extensions, you can import the `registerLanguageCore` function and the desired extensions:

```js
import {registerLanguageCore} from '@bhsd/codemirror-mediawiki';
import {python} from '@codemirror/lang-python';
registerLanguageCore('python', python);
```

</details>

# Themes

## light

This is the default theme, which is a light theme.

## nord

<details>
	<summary>Expand</summary>

This is a dark theme created by [Takuya Matsuyama](https://www.npmjs.com/package/cm6-theme-nord) and [鬼影233](https://zh.moegirl.org.cn/User:%E9%AC%BC%E5%BD%B1233/Nord). You need to register this theme before using it:

```js
import {registerTheme, nord} from '@bhsd/codemirror-mediawiki';
registerTheme('nord', nord);
```

</details>

## Other themes

<details>
	<summary>Expand</summary>

You can also register other themes by importing the `registerTheme` function:

```js
import {registerTheme} from '@bhsd/codemirror-mediawiki';
import {oneDark} from '@codemirror/theme-one-dark';
registerTheme('one-dark', oneDark);
```

</details>

# Constructor

<details>
	<summary>Expand</summary>

**param**: `HTMLTextAreaElement` the textarea element to be replaced by CodeMirror  
**param**: `string` the language mode to be used, default as plain text  
**param**: `unknown` the language configuration, only required for the MediaWiki mode and the mixed MediaWiki-HTML mode  
**param**: `boolean` whether to initialize immediately, default as true  

```js
let cm;
cm = new CodeMirror6(textarea); // plain text
cm = new CodeMirror6(textarea, 'mediawiki', mwConfig);
cm = new CodeMirror6(textarea, 'html', mwConfig);
cm = new CodeMirror6(textarea, 'css');
cm = new CodeMirror6(textarea, 'javascript');
cm = new CodeMirror6(textarea, 'json');
cm = new CodeMirror6(textarea, 'lua');
cm = new CodeMirror6(textarea, 'vue');
```

</details>

# Accessors

## dialect

<details>
	<summary>Expand</summary>

*version added: 2.28.0*

**type**: `'sanitized-css' | undefined`  
Only used for [Extension:TemplateStyles](https://www.mediawiki.org/wiki/Extension:TemplateStyles) as a dialect of the CSS mode.

</details>

## lang

<details>
	<summary>Expand</summary>

*version added: 2.0.14*

**type**: `string`  
The current language mode, read-only.

</details>

## textarea

<details>
	<summary>Expand</summary>

**type**: `HTMLTextAreaElement`  
The textarea element replaced by CodeMirror, read-only.

</details>

## view

<details>
	<summary>Expand</summary>

**type**: [`EditorView | undefined`](https://codemirror.net/6/docs/ref/#view.EditorView)  
The CodeMirror EditorView instance, read-only.

</details>

## visible

<details>
	<summary>Expand</summary>

*version added: 2.1.3*

**type**: `boolean`  
Whether the editor is visible, read-only.

</details>

# Methods

## destroy

<details>
	<summary>Expand</summary>

*version added: 2.28.2*

Destroy the instance. This method is irrevocable and not recommended for general use. Instead, you should call the [`toggle`](#toggle) method to hide the editor.

```js
cm.destroy();
```

</details>

## extraKeys

<details>
	<summary>Expand</summary>

*version added: 2.2.2*

**param**: [`KeyBinding[]`](https://codemirror.net/docs/ref/#view.KeyBinding) the extra key bindings  
Add extra key bindings. Need initialization first.

```js
cm.extraKeys([
	{key: 'Tab', run: () => console.log('Tab'), preventDefault: true},
]);
```

</details>

## getLinter

<details>
	<summary>Expand</summary>

*version added: 2.1.3*

**param**: `Record<string, any>` the optional linter configuration  
**returns**: `Promise<(state: EditorState) => Diagnostic[] | Promise<Diagnostic[]>>`  
Get the default linting function, which can be used as the argument of [`lint`](#lint).

```js
const linter = await cm.getLinter(); // default linter configuration
const linterMediawiki = await cm.getLinter({include: true, i18n: 'zh-hans'}); // wikilint configuration
const linterJavaScript = await cm.getLinter({env, parserOptions, rules}); // ESLint configuration
const linterCSS = await cm.getLinter({rules}); // Stylelint configuration
```

</details>

## getNodeAt

<details>
	<summary>Expand</summary>

*version added: 2.4.2*

**param**: `number` position  
**returns**: [`SyntaxNode | undefined`](https://lezer.codemirror.net/docs/ref/#common.SyntaxNode)  
Get the syntax node at the given position.

```js
const tree = cm.getNodeAt(0);
```

</details>

## hasPreference

<details>
	<summary>Expand</summary>

*version added: 3.2.0*

**param**: `string` extension name  
**returns**: `boolean`  
Check if the editor enables the given extension.

```js
const hasAutocompletion = cm.hasPreference('autocompletion');
```

</details>

## initialize

<details>
	<summary>Expand</summary>

*version added: 2.11.1*

**param**: `unknown` the optional language configuration  
Initialize the editor.

```js
cm.initialize();
```

</details>

## lint

<details>
	<summary>Expand</summary>

**param**: `(state: EditorState) => Diagnostic[] | Promise<Diagnostic[]>` the linting function  
Set the linting function.

```js
cm.lint(({doc}) => [
	/**
	 * @type {Diagnostic}
	 * @see https://codemirror.net/docs/ref/#lint.Diagnostic
	 */
	{
		from: 0,
		to: doc.toString().length,
		message: 'error message',
		severity: 'error',
	},
]);
```

</details>

## localize

<details>
	<summary>Expand</summary>

*version added: 2.3.3*

**param**: `Record<string, string>` localization table  
Set the localization table.

```js
cm.localize({
	'Find': '查找',
});
```

</details>

## prefer

<details>
	<summary>Expand</summary>

*version added: 2.0.9*

**param**: `string[] | Record<string, boolean>` the [extensions](#extensions) to enable  
Set the preferred CodeMirror extensions. Available extensions are introduced [later](#extensions).

```js
cm.prefer([
	'allowMultipleSelections',
	'autocompletion',
	'bracketMatching',
	'closeBrackets',
	'codeFolding',
	'highlightActiveLine',
	'highlightSelectionMatches',
	'highlightSpecialChars',
	'highlightTrailingWhitespace',
	'highlightWhitespace',
	'scrollPastEnd',

	// only available in CSS and MediaWiki modes
	'colorPicker',

	// only available in MediaWiki mode
	'escape',
	'hover',
	'inlayHints',
	'openLinks',
	'refHover',
	'signatureHelp',
]);
cm.prefer({
	allowMultipleSelections: false,
	autocompletion: false,
	bracketMatching: false,
	closeBrackets: false,
	codeFolding: false,
	highlightActiveLine: false,
	highlightSelectionMatches: false,
	highlightSpecialChars: false,
	highlightTrailingWhitespace: false,
	highlightWhitespace: false,
	scrollPastEnd: false,

	// only available in CSS and MediaWiki modes
	colorPicker: false,

	// only available in MediaWiki mode
	escape: false,
	hover: false,
	inlayHints: false,
	openLinks: false,
	refHover: false,
	signatureHelp: false,
});
```

</details>

## scrollTo

<details>
	<summary>Expand</summary>

*version added: 2.6.2*

**param**: [`number | {anchor: number, head: number}`](https://codemirror.net/docs/ref/#state.SelectionRange.anchor) the position or range to scroll to, default as the current cursor position  
Scroll to the given position or range. Need initialization first.

```js
cm.scrollTo();
```

</details>

## setContent

<details>
	<summary>Expand</summary>

*version added: 2.1.8*

**param**: `string` new content  
**param**: `boolean` whether to force the content to be set in the read-only mode, default as false  
Reset the content of the editor. Need initialization first.

```js
cm.setContent('');
```

</details>

## setIndent

<details>
	<summary>Expand</summary>

*version added: 2.0.9*

**param**: `string` the indentation string, default as tab  
Set the indentation string.

```js
cm.setIndent(' '.repeat(2));
cm.setIndent('\t');
```

</details>

## setLanguage

<details>
	<summary>Expand</summary>

**param**: `string` the language mode to be used, default as plain text  
**param**: `unknown` the optional language configuration  
Set the language mode.

```js
cm.setLanguage('mediawiki', mwConfig);
cm.setLanguage('html', mwConfig);
cm.setLanguage('css');
cm.setLanguage('javascript');
cm.setLanguage('json');
cm.setLanguage('lua');
cm.setLanguage('vue');
```

</details>

## setLineWrapping

<details>
	<summary>Expand</summary>

*version added: 2.28.0*

**param**: `boolean` whether to enable line wrapping  
Switch between line wrapping and no line wrapping.

```js
cm.setLineWrapping(false);
cm.setLineWrapping(true);
```

</details>

## setTheme

<details>
	<summary>Expand</summary>

*version added: 3.3.0*

**param**: `string` the theme name  
Set the theme of the editor. The default theme is `light`, other themes need to be registered using the `registerTheme` function first:

```js
import {registerTheme, nord} from '@bhsd/codemirror-mediawiki';
registerTheme('nord', nord);
cm.setTheme('nord');
```

</details>

## toggle

<details>
	<summary>Expand</summary>

*version added: 2.1.3*

**param**: `boolean` whether to show the editor, optional  
Switch between the CodeMirror editor and the native textarea. Need initialization first.

```js
cm.toggle();
cm.toggle(true); // show CodeMirror
cm.toggle(false); // hide CodeMirror
```

</details>

## update

<details>
	<summary>Expand</summary>

Refresh linting immediately.

</details>

# Static methods

## getMwConfig

<details>
	<summary>Expand</summary>

*version added: 2.4.7*

**param**: [`Config`](https://github.com/bhsd-harry/wikiparser-node/wiki/types#config) the [WikiLint](https://www.npmjs.com/package/wikilint) configuration  
**returns**: `MwConfig`  
Derive the configuration for the MediaWiki mode from WikiLint configuration.

```js
const mwConfig = CodeMirror6.getMwConfig(config);
```

</details>

## replaceSelections

<details>
	<summary>Expand</summary>

*version added: 2.2.2*

**param**: [`EditorView`](https://codemirror.net/6/docs/ref/#view.EditorView) the CodeMirror EditorView instance  
**param**: `(str: string, range: {from: number, to: number}) => string | [string, number, number?]` the replacement function  
Replace the selected text with the return value of the replacement function.

```js
CodeMirror6.replaceSelections(cm.view, str => str.toUpperCase());
```

</details>

# Extensions

## allowMultipleSelections

<details>
	<summary>Expand</summary>

*version added: 2.1.11*

Allow multiple selections. This extension also enables rectangular selections by holding down the `Alt` key.

For granular control over the bundled extensions, you can import the `registerAllowMultipleSelections` function:

```js
import {registerAllowMultipleSelections} from '@bhsd/codemirror-mediawiki';
registerAllowMultipleSelections();
```

</details>

## autocompletion

<details>
	<summary>Expand</summary>

*version added: 2.5.1*

Provide autocompletion for MediaWiki, CSS and JavaScript modes.

For granular control over the bundled extensions, you can import the `registerAutocompletion` function:

```js
import {registerAutocompletion} from '@bhsd/codemirror-mediawiki';
registerAutocompletion();
```

</details>

## bracketMatching

<details>
	<summary>Expand</summary>

*version added: 2.0.9*

Matched or unmatched brackets or tags are highlighted in cyan or dark red when the cursor is next to them.

For granular control over the bundled extensions, you can import the `registerBracketMatching` function:

```js
import {registerBracketMatching} from '@bhsd/codemirror-mediawiki';
registerBracketMatching();
```

</details>

## closeBrackets

<details>
	<summary>Expand</summary>

*version added: 2.0.9*

Automatically close brackets (`{`, `[` and `(`) and quotes (`"`, and `'` except for the MediaWiki mode).

For granular control over the bundled extensions, you can import the `registerCloseBrackets` function:

```js
import {registerCloseBrackets} from '@bhsd/codemirror-mediawiki';
registerCloseBrackets();
```

</details>

## codeFolding

<details>
	<summary>Expand</summary>

*version added: 2.3.0*

Fold sections, templates, parser functions and extension tags in the MediaWiki mode, and code blocks in other modes.

Key bindings:

- `Ctrl` + `Shift` + `[`/`Cmd` + `Alt` + `[`: Fold at the selected text
- `Ctrl` + `Shift` + `]`/`Cmd` + `Alt` + `]`: Unfold at the selected text
- `Ctrl` + `Alt` + `[`: Fold all
- `Ctrl` + `Alt` + `]`: Unfold all

For granular control over the bundled extensions, you can import the `registerCodeFolding` function:

```js
import {registerCodeFolding} from '@bhsd/codemirror-mediawiki';
registerCodeFolding();
```

</details>

## colorPicker

<details>
	<summary>Expand</summary>

*version added: 2.18.0*

Provide color pickers for CSS and MediaWiki modes.

For granular control over the bundled extensions, you can import the `registerColorPicker` functions. Note that you also need to register this extension for specific languages([CSS](#css), [MediaWiki](#mediawiki) or [Vue](#vue)):

```js
import {registerColorPicker} from '@bhsd/codemirror-mediawiki';
registerColorPicker();
```

</details>

## escape

<details>
	<summary>Expand</summary>

*version added: 2.2.2*

Key bindings:

- `Ctrl`/`Cmd` + `[`: Escape the selected text with HTML entities
- `Ctrl`/`Cmd` + `]`: Escape the selected text with URL encoding

For granular control over the bundled extensions, you can import the `registerEscape` function:

```js
import {registerEscape} from '@bhsd/codemirror-mediawiki';
registerEscape();
```

</details>

## highlightActiveLine

<details>
	<summary>Expand</summary>

Highlight the line the cursor is on in light cyan.

For granular control over the bundled extensions, you can import the `registerHighlightActiveLine` function:

```js
import {registerHighlightActiveLine} from '@bhsd/codemirror-mediawiki';
registerHighlightActiveLine();
```

</details>

## highlightSelectionMatches

<details>
	<summary>Expand</summary>

*version added: 2.15.3*

Highlight texts that match the selection in light green.

For granular control over the bundled extensions, you can import the `registerHighlightSelectionMatches` function:

```js
import {registerHighlightSelectionMatches} from '@bhsd/codemirror-mediawiki';
registerHighlightSelectionMatches();	
```

</details>

## highlightSpecialChars

<details>
	<summary>Expand</summary>

Show invisible characters as red dots.

For granular control over the bundled extensions, you can import the `registerHighlightSpecialChars` function:

```js
import {registerHighlightSpecialChars} from '@bhsd/codemirror-mediawiki';
registerHighlightSpecialChars();
```

</details>

## highlightTrailingWhitespace

<details>
	<summary>Expand</summary>

*version added: 2.0.9*

Highlight trailing whitespace in a red-orange color.

For granular control over the bundled extensions, you can import the `registerHighlightTrailingWhitespace` function:

```js
import {registerHighlightTrailingWhitespace} from '@bhsd/codemirror-mediawiki';
registerHighlightTrailingWhitespace();
```

</details>

## highlightWhitespace

<details>
	<summary>Expand</summary>

*version added: 2.0.12*

Show spaces and tabs as dots and arrows.

For granular control over the bundled extensions, you can import the `registerHighlightWhitespace` function:

```js
import {registerHighlightWhitespace} from '@bhsd/codemirror-mediawiki';
registerHighlightWhitespace();
```

</details>

## hover

<details>
	<summary>Expand</summary>

*version added: 2.21.1*

Show the help information of a magic word when hovering.

For granular control over the bundled extensions, you can import the `registerHover` function:

```js
import {registerHover} from '@bhsd/codemirror-mediawiki';
registerHover();
```

</details>

## inlayHints

<details>
	<summary>Expand</summary>

*version added: 2.22.0*

Show inlay hints for anonymous parameters.

For granular control over the bundled extensions, you can import the `registerInlayHints` function:

```js
import {registerInlayHints} from '@bhsd/codemirror-mediawiki';
registerInlayHints();
```

</details>

## openLinks

<details>
	<summary>Expand</summary>

*version added: 2.19.6*

CTRL/CMD-click opens a link in a new tab.

For granular control over the bundled extensions, you can import the `registerOpenLinks` function:

```js
import {registerOpenLinks} from '@bhsd/codemirror-mediawiki';
registerOpenLinks();
```

</details>

## refHover

<details>
	<summary>Expand</summary>

*version added: 2.17.1*

Show the content of the `<ref>` tag defined elsewhere when hovering.

For granular control over the bundled extensions, you can import the `registerRefHover` function:

```js
import {registerRefHover} from '@bhsd/codemirror-mediawiki';
registerRefHover();
```

</details>

## scrollPastEnd

<details>
	<summary>Expand</summary>

*version added: 2.15.3*

Allow the editor to be scrolled down past the end of the document.

For granular control over the bundled extensions, you can import the `registerScrollPastEnd` function:

```js
import {registerScrollPastEnd} from '@bhsd/codemirror-mediawiki';
registerScrollPastEnd();
```

</details>

## signatureHelp

<details>
	<summary>Expand</summary>

*version added: 2.21.1*

Show the parser function signature when typing.

For granular control over the bundled extensions, you can import the `registerSignatureHelp` function:

```js
import {registerSignatureHelp} from '@bhsd/codemirror-mediawiki';
registerSignatureHelp();
```

</details>

# Known issues

## Syntax Highlighting

<details>
	<summary>Expand</summary>

### Extension

1. [Extension:Poem](https://www.mediawiki.org/wiki/Extension:Poem) should prevent preformatted text ([Example](http://bhsd-harry.github.io/monaco-wiki/tests.html#%3Cpoem%3E%20with%20leading%20whitespace)).

### Transclusion

1. Non-existing parser functions starting with `#` are highlighted as parser functions ([Example](http://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Parsoid%3A%20unknown%20parser%20function%20(T314524))).
1. Wikitext in template parameter names is not highlighted ([Example](http://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Templates%3A%20Other%20wikitext%20in%20parameter%20names%20(T69657))).
1. Template parameter names followed by a newline are not recognized ([Example](http://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Templates%3A%20Handle%20comments%20in%20parameter%20names%20(T69657))).

### Heading

1. Comments at the SOL should not break section headings ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Section%20extraction%20prefixed%20by%20comment%20(section%201))).

### Table

1. Comments at the SOL should not break table syntax ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#3c.%20Table%20cells%20without%20escapable%20prefixes%20after%20edits)).

### External link

1. IPv6 addresses are not supported ([Example](http://bhsd-harry.github.io/codemirror-mediawiki/tests.html#IPv6%20urls%2C%20autolink%20format%20(T23261))).
1. External links inside double brackets are highlighted incorrectly ([Example](http://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Render%20invalid%20page%20names%20as%20plain%20text%20(T53090))).

### Block element

1. Comments at the SOL break the highlighting ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#1.%20Lists%20with%20start-of-line-transparent%20tokens%20before%20bullets%3A%20Comments)).
1. False positives of preformatted text when there are categories ([Example](http://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Category%20%2F%20paragraph%20interactions)) or HTML tags ([Example](http://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Parsing%20optional%20HTML%20elements%20(T8171))).

### Language conversion

1. BCP 47 language codes are not supported in language conversion ([Example](https://bhsd-harry.github.io/wikiparser-node/tests.html#Explicit%20definition%20of%20language%20variant%20alternatives%20(BCP%2047%20codes))).

</details>
