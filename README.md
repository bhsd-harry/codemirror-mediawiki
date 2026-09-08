# @bhsd/codemirror-mediawiki

[![npm version](https://badge.fury.io/js/@bhsd%2Fcodemirror-mediawiki.svg)](https://www.npmjs.com/package/@bhsd/codemirror-mediawiki)
[![CodeQL](https://github.com/bhsd-harry/codemirror-mediawiki/actions/workflows/codeql.yml/badge.svg)](https://github.com/bhsd-harry/codemirror-mediawiki/actions/workflows/codeql.yml)
[![NPM downloads](https://img.shields.io/npm/dm/%40bhsd%2Fcodemirror-mediawiki)](https://www.npmjs.com/package/@bhsd/codemirror-mediawiki)
[![jsDelivr hits (npm scoped)](https://img.shields.io/jsdelivr/npm/hm/%40bhsd/codemirror-mediawiki)](https://www.npmjs.com/package/@bhsd/codemirror-mediawiki)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/972fd5f6684c4fd8ac2f26e01d349948)](https://app.codacy.com/gh/bhsd-harry/codemirror-mediawiki/dashboard)

This repository contains a modified version of the frontend scripts and styles
from [MediaWiki extension CodeMirror](https://www.mediawiki.org/wiki/Extension:CodeMirror).
The goal is to support a standalone integration between [CodeMirror](https://codemimrror.net)
and [Wikitext](https://www.mediawiki.org/wiki/Wikitext), without the need for a
[MediaWiki environment](https://doc.wikimedia.org/mediawiki-core/master/js/).

Here is a [demo](https://bhsd-harry.github.io/codemirror-mediawiki). To
experiment with the RTL (right-to-left) support, you can append `?rtl=1` to the
URL.

Nonetheless, this repository also provides a customized version with additional
functionality for use on a MediaWiki site. Browser editing tools such as
[Wikiplus-highlight](https://www.npmjs.com/package/wikiplus-highlight) and an
[InPageEdit plugin](https://github.com/inpageedit/Plugins/blob/master/src/plugins/code-mirror/cm6.js)
are built upon it. Please refer to a separate [README](./mw/README.md) file for
the information.

If you are just looking for a CodeMirror 6 language mode and language support
extensions for MediaWiki Wikitext, you can use [@bhsd/codemirror-wikitext](https://www.npmjs.com/package/@bhsd/codemirror-wikitext)
instead.

<details>
	<summary>Expand</summary>

- [Installation](#installation)
- [Browser Usage](#browser-usage)
- [Language modes](#language-modes)
	- [abusefilter](#abusefilter)
	- [css](#css)
	- [html](#html)
	- [javascript](#javascript)
	- [json](#json)
	- [jsonc](#jsonc)
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
	- [clearCustomHighlight](#clearcustomhighlight)
	- [customHighlight](#customhighlight)
	- [destroy](#destroy)
	- [extraKeys](#extrakeys)
	- [getLinter](#getlinter)
	- [getNodeAt](#getnodeat)
	- [initialize](#initialize)
	- [lint](#lint)
	- [localize](#localize)
	- [prefer](#prefer)
	- [replaceSelections](#replaceselections)
	- [scrollTo](#scrollto)
	- [setColumnGuide](#setcolumnguide)
	- [setContent](#setcontent)
	- [setIndent](#setindent)
	- [setLanguage](#setlanguage)
	- [setLineWrapping](#setlinewrapping)
	- [setTheme](#settheme)
	- [toggle](#toggle)
	- [update](#update)
- [Static accessors](#static-accessors)
	- [CDN](#cdn)
- [Static methods](#static-methods)
	- [getMwConfig](#getmwconfig)
	- [replaceSelections](#replaceselections-static)
- [Extensions](#extensions)
	- [allowMultipleSelections](#allowmultipleselections)
	- [autocompletion](#autocompletion)
	- [bidiIsolates](#bidiisolates)
	- [blockCursor](#blockcursor)
	- [bracketMatching](#bracketmatching)
	- [closeBrackets](#closebrackets)
	- [closeTags](#closetags)
	- [codeFolding](#codefolding)
	- [colorPicker](#colorpicker)
	- [escape](#escape)
	- [highlightActiveLine](#highlightactiveline)
	- [highlightSelectionMatches](#highlightselectionmatches)
	- [highlightSpecialChars](#highlightspecialchars)
	- [highlightTrailingWhitespace](#highlighttrailingwhitespace)
	- [highlightWhitespace](#highlightwhitespace)
	- [hover](#hover)
	- [indentGuide](#indentguide)
	- [inlayHints](#inlayhints)
	- [openLinks](#openlinks)
	- [refHover](#refhover)
	- [scrollPastEnd](#scrollpastend)
	- [signatureHelp](#signaturehelp)
	- [stickyScroll](#stickyscroll)
- [Known issues](#known-issues)
	- [Syntax Highlighting](#syntax-highlighting)

</details>

## Installation

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
	registerJSONC,
	registerLua,
	registerVue,
	registerAbuseFilter,
} from '@bhsd/codemirror-mediawiki';
```

## Browser Usage

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
	registerJSONC,
	registerLua,
	registerVue,
	registerAbuseFilter,
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
	registerJSONC,
	registerLua,
	registerVue,
	registerAbuseFilter,
} from 'https://unpkg.com/@bhsd/codemirror-mediawiki/dist/main.min.js';
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
	registerJSONC,
	registerLua,
	registerVue,
	registerAbuseFilter,
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
	registerJSONC,
	registerLua,
	registerVue,
	registerAbuseFilter,
} = await import('https://unpkg.com/@bhsd/codemirror-mediawiki/dist/main.min.js');
```

</details>

## Language modes

### abusefilter

*version added: 3.10.0*

<details>
	<summary>Expand</summary>

You can bundle the [AbuseFilter](https://www.mediawiki.org/wiki/Extension:AbuseFilter)
mode by importing the `registerAbuseFilter` function:

```js
import {registerAbuseFilter} from '@bhsd/codemirror-mediawiki';
registerAbuseFilter();
```

If you want a more granular control over the extensions, you can import the
`registerAbuseFilterCore` function and the desired extensions:

```js
import {registerAbuseFilterCore} from '@bhsd/codemirror-mediawiki';
registerAbuseFilterCore();
```

In addition to the common [extensions](#extensions), here are some
AbuseFilter-specific extensions. Note that these extensions may not take effect
if the corresponding common extensions are not registered:

```js
import {registerHoverForAbuseFilter} from '@bhsd/codemirror-mediawiki';
registerHoverForAbuseFilter();
```

</details>

### css

<details>
	<summary>Expand</summary>

The CSS mode contains a [dialect](#dialect) for [Extension:TemplateStyles](https://www.mediawiki.org/wiki/Extension:TemplateStyles).
You can bundle the CSS mode by importing the `registerCSS` function:

```js
import {registerCSS} from '@bhsd/codemirror-mediawiki';
registerCSS();
```

If you want a more granular control over the extensions, you can import the
`registerCSSCore` function and the desired extensions:

```js
import {registerCSSCore} from '@bhsd/codemirror-mediawiki';
registerCSSCore();
```

In addition to the common [extensions](#extensions), here are some CSS-specific
extensions. Note that these extensions may not take effect if the corresponding
common extensions are not registered:

```js
import {registerColorPickerForCSS} from '@bhsd/codemirror-mediawiki';
registerColorPickerForCSS();
```

</details>

### html

<details>
	<summary>Expand</summary>

This is a mixed MediaWiki-HTML mode, which is used for [Extension:Widgets](https://www.mediawiki.org/wiki/Extension:Widgets).
You can bundle the HTML mode by importing the `registerHTML` function:

```js
import {registerHTML} from '@bhsd/codemirror-mediawiki';
registerHTML();
```

If you want a more granular control over the extensions, you can import the
`registerHTMLCore` function and the desired extensions:

```js
import {registerHTMLCore} from '@bhsd/codemirror-mediawiki';
registerHTMLCore();
```

In addition to the common [extensions](#extensions), here are some HTML-specific
extensions. Note that these extensions may not take effect if the corresponding
common extensions are not registered:

```js
import {
	registerBracketMatchingForHTML,
	registerCloseTagsForHTML,
	registerColorPickerForHTML,
} from '@bhsd/codemirror-mediawiki';
registerBracketMatchingForHTML();
registerCloseTagsForHTML();
registerColorPickerForHTML();
```

</details>

### javascript

<details>
	<summary>Expand</summary>

You can bundle the JavaScript mode by importing the `registerJavaScript` function:

```js
import {registerJavaScript} from '@bhsd/codemirror-mediawiki';
registerJavaScript();
```

If you want a more granular control over the extensions, you can import the
`registerJavaScriptCore` function and the desired extensions:

```js
import {registerJavaScriptCore} from '@bhsd/codemirror-mediawiki';
registerJavaScriptCore();
```

In addition to the common [extensions](#extensions), here are some
JavaScript-specific extensions. Note that these extensions may not take effect
if the corresponding common extensions are not registered:

```js
import {registerBracketMatchingForJavaScript} from '@bhsd/codemirror-mediawiki';
registerBracketMatchingForJavaScript();
```

</details>

### json

<details>
	<summary>Expand</summary>

You can bundle the JSON mode by importing the `registerJSON` function:

```js
import {registerJSON} from '@bhsd/codemirror-mediawiki';
registerJSON();
```

If you want a more granular control over the extensions, you can import the
`registerJSONCore` function and the desired extensions:

```js
import {registerJSONCore} from '@bhsd/codemirror-mediawiki';
registerJSONCore();
```

</details>

### jsonc

<details>
	<summary>Expand</summary>

You can bundle the JSONC mode by importing the `registerJSONC` function:

```js
import {registerJSONC} from '@bhsd/codemirror-mediawiki';
registerJSONC();
```

If you want a more granular control over the extensions, you can import the
`registerJSONCCore` function and the desired extensions:

```js
import {registerJSONCCore} from '@bhsd/codemirror-mediawiki';
registerJSONCCore();
```

</details>

### lua

<details>
	<summary>Expand</summary>

You can bundle the Lua mode by importing the `registerLua` function:

```js
import {registerLua} from '@bhsd/codemirror-mediawiki';
registerLua();
```

If you want a more granular control over the extensions, you can import the
`registerLuaCore` function and the desired extensions:

```js
import {registerLuaCore} from '@bhsd/codemirror-mediawiki';
registerLuaCore();
```

In addition to the common [extensions](#extensions), here are some Lua-specific
extensions. Note that these extensions may not take effect if the corresponding
common extensions are not registered:

```js
import {registerOpenLinksForLua} from '@bhsd/codemirror-mediawiki';
registerOpenLinksForLua();
```

</details>

### mediawiki

<details>
	<summary>Expand</summary>

You can bundle the MediaWiki mode by importing the `registerMediaWiki` function:

```js
import {registerMediaWiki} from '@bhsd/codemirror-mediawiki';
// optionally pass the article path of a MediaWiki site
registerMediaWiki('https://www.mediawiki.org/wiki/');
```

The MediaWiki mode provides the following key bindings for quick formatting:

- `Ctrl` + `0`: Plain paragraph
- `Ctrl` + `1-6`: Headings level 1 to 6
- `Ctrl` + `7`: Preformatted text
- `Ctrl` + `8`: Blockquote
- `Ctrl`/`Cmd` + `/`: Comment
- `Ctrl`/`Cmd` + `.`: Superscript
- `Ctrl`/`Cmd` + `,`: Subscript
- `Ctrl`/`Cmd` + `B`: Bold
- `Ctrl`/`Cmd` + `I`: Italic
- `Ctrl`/`Cmd` + `U`: Underline
- `Ctrl`/`Cmd` + `K`: Wiki link
- `Ctrl` + `Shift` + `5`: Strikethrough
- `Ctrl`/`Cmd` + `Shift` + `6`: Inline code
- `Ctrl`/`Cmd` + `Shift` + `K`: Ref tag

If you want a more granular control over the extensions, you can import the
`registerMediaWikiCore` function and the desired extensions:

```js
import {registerMediaWikiCore} from '@bhsd/codemirror-mediawiki';
// optionally pass the article path of a MediaWiki site
registerMediaWikiCore('https://www.mediawiki.org/wiki/');
```

In addition to the common [extensions](#extensions), here are some
MediaWiki-specific extensions. Note that these extensions may not take effect if
the corresponding common extensions are not registered:

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

### vue

<details>
	<summary>Expand</summary>

You can bundle the Vue mode by importing the `registerVue` function:

```js
import {registerVue} from '@bhsd/codemirror-mediawiki';
registerVue();
```

If you want a more granular control over the extensions, you can import the
`registerVueCore` function and the desired extensions:

```js
import {registerVueCore} from '@bhsd/codemirror-mediawiki';
registerVueCore();
```

In addition to the common [extensions](#extensions), here are some Vue-specific
extensions. Note that these extensions may not take effect if the corresponding
common extensions are not registered:

```js
import {
	registerBracketMatchingForVue,
	registerCloseTagsForVue,
	registerColorPickerForVue,
} from '@bhsd/codemirror-mediawiki';
registerBracketMatchingForVue();
registerCloseTagsForVue();
registerColorPickerForVue();
```

</details>

### Other languages

<details>
	<summary>Expand</summary>

You can also register other languages by importing the `registerLanguage` function:

```js
import {registerLanguage} from '@bhsd/codemirror-mediawiki';
import {python} from '@codemirror/lang-python';
registerLanguage('python', python);
```

If you want a more granular control over the extensions, you can import the
`registerLanguageCore` function and the desired extensions:

```js
import {registerLanguageCore} from '@bhsd/codemirror-mediawiki';
import {python} from '@codemirror/lang-python';
registerLanguageCore('python', python);
```

</details>

## Themes

### light

This is the default theme, which is a light theme.

### nord

<details>
	<summary>Expand</summary>

This is a dark theme created by [Takuya Matsuyama](https://www.npmjs.com/package/cm6-theme-nord)
and [鬼影233](https://zh.moegirl.org.cn/User:%E9%AC%BC%E5%BD%B1233/Nord). You need
to register this theme before using it:

```js
import {registerTheme, nord} from '@bhsd/codemirror-mediawiki';
registerTheme('nord', nord);
```

</details>

### Other themes

<details>
	<summary>Expand</summary>

You can also register other themes by importing the `registerTheme` function:

```js
import {registerTheme} from '@bhsd/codemirror-mediawiki';
import {oneDark} from '@codemirror/theme-one-dark';
registerTheme('one-dark', oneDark);
```

</details>

## Constructor

<details>
	<summary>Expand</summary>

**param**: `HTMLTextAreaElement` the textarea element to be replaced by
CodeMirror  
**param**: `string` the language mode to be used, default as plain text  
**param**: `unknown` the language configuration, only required for the [MediaWiki](#mediawiki)
mode and the [mixed MediaWiki-HTML](#html) mode  
**param**: `boolean` whether to initialize immediately, default as true  

```js
let cm;
cm = new CodeMirror6(textarea); // plain text
cm = new CodeMirror6(textarea, 'mediawiki', mwConfig);
cm = new CodeMirror6(textarea, 'html', mwConfig);
cm = new CodeMirror6(textarea, 'css');
cm = new CodeMirror6(textarea, 'javascript');
cm = new CodeMirror6(textarea, 'json');
cm = new CodeMirror6(textarea, 'jsonc');
cm = new CodeMirror6(textarea, 'lua');
cm = new CodeMirror6(textarea, 'vue');
cm = new CodeMirror6(textarea, 'abusefilter', dialect);
```

</details>

## Accessors

### dialect

<details>
	<summary>Expand</summary>

*version added: 2.28.0*

**type**: `'sanitized-css' | undefined`  
Only used for [Extension:TemplateStyles](https://www.mediawiki.org/wiki/Extension:TemplateStyles)
as a dialect of the CSS mode.

</details>

### lang

<details>
	<summary>Expand</summary>

*version added: 2.0.14*

**type**: `string`  
The current language mode, read-only.

</details>

### textarea

<details>
	<summary>Expand</summary>

**type**: `HTMLTextAreaElement`  
The textarea element replaced by CodeMirror, read-only.

</details>

### view

<details>
	<summary>Expand</summary>

**type**:
[`EditorView | undefined`](https://codemirror.net/6/docs/ref/#view.EditorView)  
The CodeMirror EditorView instance, read-only.

</details>

### visible

<details>
	<summary>Expand</summary>

*version added: 2.1.3*

**type**: `boolean`  
Whether the editor is visible, read-only.

</details>

## Methods

### clearCustomHighlight

<details>
	<summary>Expand</summary>

*version added: 3.13.1*

Remove all custom syntax highlighting styles added via [`customHighlight`](#customhighlight).

```js
cm.clearCustomHighlight();
```

</details>

### customHighlight

<details>
	<summary>Expand</summary>

*version added: 3.13.1*

Add custom syntax highlighting styles. This method works for all non-MediaWiki
modes. You can call this method multiple times to add different styles, with
later styles having higher priority.

Custom styles have higher priority than [theme](#themes) styles, and
light-mode/dark-mode custom styles have higher priority than common custom styles.

```js
cm.customHighlight([
	{
		tag: ['string', 'number'],
		color: 'red',
	},
	{
		tag: 'string.special',
		class: 'cm-special-string',
	},
]);
cm.customHighlight(
	{
		tag: ['variableName.definition'],
		fontWeight: 'bold',
	},
	'dark',
);
```

</details>

### destroy

<details>
	<summary>Expand</summary>

*version added: 2.28.2*

Destroy the instance. This method is irrevocable and not recommended for general
use. Instead, you should call the [`toggle`](#toggle) method to hide the editor.

```js
cm.destroy();
```

</details>

### extraKeys

<details>
	<summary>Expand</summary>

*version added: 2.2.2*

**param**: [`KeyBinding[]`](https://codemirror.net/docs/ref/#view.KeyBinding)
the extra key bindings  
Add extra key bindings. Need initialization first.

```js
cm.extraKeys([
	{key: 'Tab', run: () => console.log('Tab'), preventDefault: true},
]);
```

</details>

### getLinter

<details>
	<summary>Expand</summary>

*version added: 2.1.3*

**param**: `Record<string, any>` the optional linter configuration  
**returns**:
`Promise<(state: EditorState) => Diagnostic[] | Promise<Diagnostic[]>>`  
Get the default linting function, which can be used as the argument of [`lint`](#lint).

```js
const linter = await cm.getLinter(); // default linter configuration
const linterMediawiki = await cm.getLinter({include: true, i18n: 'zh-hans'}); // wikilint configuration
const linterJavaScript = await cm.getLinter({env, parserOptions, rules}); // ESLint configuration
const linterCSS = await cm.getLinter({rules}); // Stylelint configuration
```

</details>

### getNodeAt

<details>
	<summary>Expand</summary>

*version added: 2.4.2*

**param**: `number` position  
**param**: [`-1 | 0 | 1`](https://lezer.codemirror.net/docs/ref/#common.Tree.resolve)
side, optional  
**returns**:
[`SyntaxNode | undefined`](https://lezer.codemirror.net/docs/ref/#common.SyntaxNode)  
Get the syntax node at the given position and side.

```js
const tree = cm.getNodeAt(0);
```

</details>

### hasPreference

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

### initialize

<details>
	<summary>Expand</summary>

*version added: 2.11.1*

**param**: `unknown` the optional language configuration  
Initialize the editor.

```js
cm.initialize();
```

</details>

### lint

<details>
	<summary>Expand</summary>

**param**: `(state: EditorState) => Diagnostic[] | Promise<Diagnostic[]>` the
linting function  
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

### localize

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

### prefer

<details>
	<summary>Expand</summary>

*version added: 2.0.9*

**param**: `string[] | Record<string, boolean>` the [extensions](#extensions) to
enable  
Set the preferred CodeMirror extensions. Available extensions are introduced [later](#extensions).

```js
cm.prefer([
	'allowMultipleSelections',
	'autocompletion',
	'bracketMatching',
	'closeBrackets',
	'closeTags',
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
	closeTags: false,
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

### replaceSelections

<details>
	<summary>Expand</summary>

*version added: 3.9.0*

**param**:
`(str: string, range: {from: number, to: number}) => string | [string, number, number?]`
the replacement function  
Replace the selected text with the return value of the replacement function.

```js
cm.replaceSelections(str => str.toUpperCase());
```

</details>

### scrollTo

<details>
	<summary>Expand</summary>

*version added: 2.6.2*

**param**: [`number | {anchor: number, head: number}`](https://codemirror.net/docs/ref/#state.SelectionRange.anchor)
the position or range to scroll to, default as the current cursor position  
Scroll to the given position or range. Need initialization first.

```js
cm.scrollTo();
```

</details>

### setColumnGuide

<details>
	<summary>Expand</summary>

*version added: 3.15.0*

**param**: `number` the column number to show the guide at, or 0 to disable the
column guide  

```js
cm.setColumnGuide(80);
```

</details>

### setContent

<details>
	<summary>Expand</summary>

*version added: 2.1.8*

**param**: `string` new content  
**param**: `boolean` whether to force the content to be set in the read-only
mode, default as false  
Reset the content of the editor. Need initialization first.

```js
cm.setContent('');
```

</details>

### setIndent

<details>
	<summary>Expand</summary>

*version added: 2.0.9*

**param**: `string | number` the indentation string or the number of spaces,
default as tab  
Set the indentation string.

```js
cm.setIndent(2);
cm.setIndent('  ');
cm.setIndent('\t');
```

</details>

### setLanguage

<details>
	<summary>Expand</summary>

**param**: `string` the language mode to be used, default as plain text  
**param**: `unknown` the language configuration, only required for the
[MediaWiki](#mediawiki) mode and the [mixed MediaWiki-HTML](#html) mode  
Set the language mode.

```js
cm.setLanguage('mediawiki', mwConfig);
cm.setLanguage('html', mwConfig);
cm.setLanguage('css');
cm.setLanguage('javascript');
cm.setLanguage('json');
cm.setLanguage('jsonc');
cm.setLanguage('lua');
cm.setLanguage('vue');
cm.setLanguage('abusefilter', dialect);
```

</details>

### setLineWrapping

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

### setTheme

<details>
	<summary>Expand</summary>

*version added: 3.3.0*

**param**: `string` the theme name  
Set the theme of the editor. The default theme is [`light`](#light), other
themes need to be registered using the `registerTheme` function first:

```js
import {registerTheme, nord} from '@bhsd/codemirror-mediawiki';
registerTheme('nord', nord);
cm.setTheme('nord');
```

</details>

### toggle

<details>
	<summary>Expand</summary>

*version added: 2.1.3*

**param**: `boolean` whether to show the editor, optional  
Switch between the CodeMirror editor and the native textarea. Need
initialization first.

```js
cm.toggle();
cm.toggle(true); // show CodeMirror
cm.toggle(false); // hide CodeMirror
```

</details>

### update

<details>
	<summary>Expand</summary>

Refresh linting immediately.

```js
cm.update();
```

</details>

## Static accessors

### CDN

<details>
	<summary>Expand</summary>

*version added: 3.8.0*

**type**: `string`  
By default, libraries such as [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node)
are loaded from `fastly.jsdelivr.net`. You can change the [jsDelivr CDN](https://www.jsdelivr.com/network)
by setting this property.

```js
CodeMirror6.CDN = 'https://cdn.jsdelivr.net';
```

</details>

## Static methods

### getMwConfig

<details>
	<summary>Expand</summary>

*version added: 2.4.7*

**param**: [`Config`](https://github.com/bhsd-harry/wikiparser-node/wiki/types#config)
the [WikiLint](https://www.npmjs.com/package/wikilint) configuration  
**returns**: `MwConfig`  
Derive the configuration for the MediaWiki mode from WikiLint configuration.

```js
const mwConfig = CodeMirror6.getMwConfig(config);
```

</details>

### replaceSelections (static)

<details>
	<summary>Expand</summary>

*version added: 2.2.2*

**param**: [`EditorView`](https://codemirror.net/6/docs/ref/#view.EditorView)
the CodeMirror EditorView instance  
**param**:
`(str: string, range: {from: number, to: number}) => string | [string, number, number?]`
the replacement function  
Replace the selected text with the return value of the replacement function.

```js
CodeMirror6.replaceSelections(cm.view, str => str.toUpperCase());
```

</details>

## Extensions

### allowMultipleSelections

<details>
	<summary>Expand</summary>

*version added: 2.1.11*

Allow multiple selections. This extension also enables rectangular selections by
holding down the `Alt` key.

For granular control over the bundled extensions, you can import the
`registerAllowMultipleSelections` function:

```js
import {registerAllowMultipleSelections} from '@bhsd/codemirror-mediawiki';
registerAllowMultipleSelections();
```

</details>

### autocompletion

<details>
	<summary>Expand</summary>

*version added: 2.5.1*

Provide autocompletion.

Key bindings:

- `Shift` + `Enter`: Trigger autocompletion
- `Tab`: Accept the selected suggestion

For granular control over the bundled extensions, you can import the
`registerAutocompletion` function:

```js
import {registerAutocompletion} from '@bhsd/codemirror-mediawiki';
registerAutocompletion();
```

</details>

### bidiIsolates

<details>
	<summary>Expand</summary>

*version added: 3.10.0*

When Wikitext contains right-to-left text, isolate bidirectional text from the
surrounding text.

This extension is not included in the [`mediawiki`](#mediawiki) language support
by default. You need to import the `registerBidiIsolates` function:

```js
import {registerBidiIsolates} from '@bhsd/codemirror-mediawiki';
registerBidiIsolates();
```

</details>

### blockCursor

<details>
	<summary>Expand</summary>

*version added: 3.16.0*

Render the cursor as a block.

For granular control over the bundled extensions, you can import the
`registerBlockCursor` function:

```js
import {registerBlockCursor} from '@bhsd/codemirror-mediawiki';
registerBlockCursor();
```

</details>

### bracketMatching

<details>
	<summary>Expand</summary>

*version added: 2.0.9*

Matched or unmatched brackets or tags are highlighted in cyan or dark red when
the cursor is next to them.

For granular control over the bundled extensions, you can import the
`registerBracketMatching` function:

```js
import {registerBracketMatching} from '@bhsd/codemirror-mediawiki';
registerBracketMatching();
```

</details>

### closeBrackets

<details>
	<summary>Expand</summary>

*version added: 2.0.9*

Automatically close brackets (`{`, `[` and `(`) and quotes (`"`, and `'` except
for the MediaWiki mode).

For granular control over the bundled extensions, you can import the
`registerCloseBrackets` function:

```js
import {registerCloseBrackets} from '@bhsd/codemirror-mediawiki';
registerCloseBrackets();
```

</details>

### closeTags

<details>
	<summary>Expand</summary>

*version added: 3.12.0*

Automatically close HTML/XML tags.

For granular control over the bundled extensions, you need to register this
extension for specific languages([HTML](#html), [MediaWiki](#mediawiki) or [Vue](#vue)):

```js
import {
	registerCloseTagsForHTML,
	registerCloseTagsForMediaWiki,
	registerCloseTagsForVue,
} from '@bhsd/codemirror-mediawiki';
registerCloseTagsForHTML();
registerCloseTagsForMediaWiki();
registerCloseTagsForVue();
```

</details>

### codeFolding

<details>
	<summary>Expand</summary>

*version added: 2.3.0*

Fold sections, templates, parser functions and extension tags in the MediaWiki
mode, and code blocks in other modes.

Key bindings:

- `Ctrl` + `Shift` + `[`/`Cmd` + `Alt` + `[`: Fold at the selected text
- `Ctrl` + `Shift` + `]`/`Cmd` + `Alt` + `]`: Unfold at the selected text
- `Ctrl` + `Alt` + `[`: Fold all
- `Ctrl` + `Alt` + `]`: Unfold all
- `Ctrl` + `Alt` + `.`: Fold all `<ref>` tags

For granular control over the bundled extensions, you can import the
`registerCodeFolding` function:

```js
import {registerCodeFolding} from '@bhsd/codemirror-mediawiki';
registerCodeFolding();
```

</details>

### colorPicker

<details>
	<summary>Expand</summary>

*version added: 2.18.0*

Provide color pickers for CSS and MediaWiki modes.

For granular control over the bundled extensions, you need to register this
extension for specific languages([CSS](#css), [HTML](#html), [MediaWiki](#mediawiki)
or [Vue](#vue)):

```js
import {
	registerColorPickerForCSS,
	registerColorPickerForHTML,
	registerColorPickerForMediaWiki,
	registerColorPickerForVue,
} from '@bhsd/codemirror-mediawiki';
registerColorPickerForCSS();
registerColorPickerForHTML();
registerColorPickerForMediaWiki();
registerColorPickerForVue();
```

</details>

### escape

<details>
	<summary>Expand</summary>

*version added: 2.2.2*

Key bindings:

- `Ctrl`/`Cmd` + `[`: Escape the selected text with HTML entities
- `Ctrl`/`Cmd` + `]`: Escape the selected text with URL encoding
- `Ctrl`/`Cmd` + `\`: Escape the selected text with [magic words](https://www.mediawiki.org/wiki/Help:Magic_words#Escaped_characters)

For granular control over the bundled extensions, you can import the
`registerEscape` function:

```js
import {registerEscape} from '@bhsd/codemirror-mediawiki';
// optionally pass the article path of a MediaWiki site
registerEscape('https://www.mediawiki.org/wiki/');
```

</details>

### highlightActiveLine

<details>
	<summary>Expand</summary>

Highlight the line the cursor is on in light cyan.

For granular control over the bundled extensions, you can import the
`registerHighlightActiveLine` function:

```js
import {registerHighlightActiveLine} from '@bhsd/codemirror-mediawiki';
registerHighlightActiveLine();
```

</details>

### highlightSelectionMatches

<details>
	<summary>Expand</summary>

*version added: 2.15.3*

Highlight texts that match the selection in light green.

For granular control over the bundled extensions, you can import the
`registerHighlightSelectionMatches` function:

```js
import {registerHighlightSelectionMatches} from '@bhsd/codemirror-mediawiki';
registerHighlightSelectionMatches();	
```

</details>

### highlightSpecialChars

<details>
	<summary>Expand</summary>

Show invisible characters as red dots.

For granular control over the bundled extensions, you can import the
`registerHighlightSpecialChars` function:

```js
import {registerHighlightSpecialChars} from '@bhsd/codemirror-mediawiki';
registerHighlightSpecialChars();
```

</details>

### highlightTrailingWhitespace

<details>
	<summary>Expand</summary>

*version added: 2.0.9*

Highlight trailing whitespace in a red-orange color.

For granular control over the bundled extensions, you can import the
`registerHighlightTrailingWhitespace` function:

```js
import {registerHighlightTrailingWhitespace} from '@bhsd/codemirror-mediawiki';
registerHighlightTrailingWhitespace();
```

</details>

### highlightWhitespace

<details>
	<summary>Expand</summary>

*version added: 2.0.12*

Show spaces and tabs as dots and arrows.

For granular control over the bundled extensions, you can import the
`registerHighlightWhitespace` function:

```js
import {registerHighlightWhitespace} from '@bhsd/codemirror-mediawiki';
registerHighlightWhitespace();
```

</details>

### hover

<details>
	<summary>Expand</summary>

*version added: 2.21.1*

Show the help information of a magic word or a template name when hovering.

For granular control over the bundled extensions, you need to register this
extension for specific languages([AbuseFilter](#abusefilter) or [MediaWiki](#mediawiki)):

```js
import {
	registerHover, // for MediaWiki
	registerHoverForAbuseFilter,
} from '@bhsd/codemirror-mediawiki';
// optionally pass the article path of a MediaWiki site
registerHover('https://www.mediawiki.org/wiki/');
registerHoverForAbuseFilter();
```

</details>

### indentGuide

<details>
	<summary>Expand</summary>

*version added: 3.16.0*

Show indent guides as vertical lines. This extension is not available in the
MediaWiki mode.

For granular control over the bundled extensions, you can import the
`registerIndentGuide` function:

```js
import {registerIndentGuide} from '@bhsd/codemirror-mediawiki';
registerIndentGuide();
```

</details>

### inlayHints

<details>
	<summary>Expand</summary>

*version added: 2.22.0*

Show inlay hints for anonymous parameters.

For granular control over the bundled extensions, you can import the
`registerInlayHints` function:

```js
import {registerInlayHints} from '@bhsd/codemirror-mediawiki';
// optionally pass the article path of a MediaWiki site
registerInlayHints('https://www.mediawiki.org/wiki/');
```

</details>

### openLinks

<details>
	<summary>Expand</summary>

*version added: 2.19.6*

CTRL/CMD-click opens a link in a new tab.

For granular control over the bundled extensions, you need to register this
extension for specific languages([Lua](#lua) or [MediaWiki](#mediawiki)):

```js
import {
	registerOpenLinks, // for MediaWiki
	registerOpenLinksForLua,
} from '@bhsd/codemirror-mediawiki';
// optionally pass the article path of a MediaWiki site
registerOpenLinks('https://www.mediawiki.org/wiki/');
registerOpenLinksForLua();
```

</details>

### refHover

<details>
	<summary>Expand</summary>

*version added: 2.17.1*

Show the content of the `<ref>` tag defined elsewhere when hovering.

For granular control over the bundled extensions, you can import the
`registerRefHover` function:

```js
import {registerRefHover} from '@bhsd/codemirror-mediawiki';
// optionally pass the article path of a MediaWiki site
registerRefHover('https://www.mediawiki.org/wiki/');
```

</details>

### scrollPastEnd

<details>
	<summary>Expand</summary>

*version added: 2.15.3*

Allow the editor to be scrolled down past the end of the document.

For granular control over the bundled extensions, you can import the
`registerScrollPastEnd` function:

```js
import {registerScrollPastEnd} from '@bhsd/codemirror-mediawiki';
registerScrollPastEnd();
```

</details>

### signatureHelp

<details>
	<summary>Expand</summary>

*version added: 2.21.1*

Show the parser function signature when typing.

For granular control over the bundled extensions, you need to register this
extension for specific languages([AbuseFilter](#abusefilter) or [MediaWiki](#mediawiki)):

```js
import {
	registerSignatureHelp, // for MediaWiki
	registerSignatureHelpForAbuseFilter,
} from '@bhsd/codemirror-mediawiki';
// optionally pass the article path of a MediaWiki site
registerSignatureHelp('https://www.mediawiki.org/wiki/');
registerSignatureHelpForAbuseFilter();
```

</details>

### stickyScroll

<details>
	<summary>Expand</summary>

*version added: 4.5.0*

Sticky opening lines of the enclosing scopes at the top of the editor when scrolling.

For granular control over the bundled extensions, you can import the
`registerStickyScroll` function:

```js
import {registerStickyScroll} from '@bhsd/codemirror-mediawiki';
registerStickyScroll();
```

</details>

## Known issues

### Syntax Highlighting

<details>
	<summary>Expand</summary>

#### Redirect

1. Redirect target cannot contain illegal characters ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#4.%20Redirect%20to%20a%20templated%20destination)).

#### Extension

1. [Extension:Poem](https://www.mediawiki.org/wiki/Extension:Poem) should
   prevent preformatted text ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#%3Cpoem%3E%20with%20leading%20whitespace)).

#### Transclusion

1. Non-existing parser functions starting with `#` are highlighted as parser
   functions ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Parsoid%3A%20unknown%20parser%20function%20(T314524))).
1. Wikitext in template parameter names is not highlighted ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Templates%3A%20Other%20wikitext%20in%20parameter%20names%20(T69657))).
1. Template parameter names followed by a newline are not recognized ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Templates%3A%20Handle%20comments%20in%20parameter%20names%20(T69657))).
1. Template-like syntax without a template name ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#T408631%3A%20Invalid%20templates%20inside%20template%20parameters)).

#### Heading

1. Comments at the SOL should not break section headings ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Section%20extraction%20prefixed%20by%20comment%20(section%201))).
1. Section headings containing multiline extension tags are not highlighted ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Heading%20with%20line%20break%20in%20nowiki)).

#### Table

1. Comments at the SOL should not break table syntax ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#3c.%20Table%20cells%20without%20escapable%20prefixes%20after%20edits)).
1. `!!` in links should start a new `<th>` ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Precedence%20of%20table%20over%20links)).

### Behavior switch

1. Behavior switch following URL protocols should not be highlighted as a URL ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Fuzz%20testing%3A%20Parser14)).

#### Link

1. Inverse pipe trick ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#pre-save%20transform%3A%20context%20links%20(%22pipe%20trick%22)%20with%20parens%20in%20title)).

#### External link

1. IPv6 addresses are not supported ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#IPv6%20urls%2C%20autolink%20format%20(T23261))).
1. External links inside double brackets are highlighted incorrectly ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Render%20invalid%20page%20names%20as%20plain%20text%20(T53090))).

#### Block element

1. Comments at the SOL break the highlighting ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#1.%20Lists%20with%20start-of-line-transparent%20tokens%20before%20bullets%3A%20Comments)).
1. False positives of preformatted text when there are categories ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Category%20%2F%20paragraph%20interactions))
   or HTML tags ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Parsing%20optional%20HTML%20elements%20(T8171))).

#### Language conversion

1. Interaction with `<nowiki>` ([Example](https://bhsd-harry.github.io/codemirror-mediawiki/tests.html#Language%20converter%20tricky%20html2wt%20cases%20(5))).

</details>
