[![npm version](https://badge.fury.io/js/@bhsd%2Fcodemirror-mediawiki.svg)](https://www.npmjs.com/package/@bhsd/codemirror-mediawiki)
[![CodeQL](https://github.com/bhsd-harry/codemirror-mediawiki/actions/workflows/codeql.yml/badge.svg)](https://github.com/bhsd-harry/codemirror-mediawiki/actions/workflows/codeql.yml)

<details>
	<summary>Expand</summary>

- [Description](#description)
- [Usage](#usage)
- [Constructor](#constructor)
- [Accessors](#accessors)
	- [textarea](#textarea)
	- [lang](#lang)
	- [view](#view)
	- [visible](#visible)
- [Methods](#methods)
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
	- [highlightActiveLine](#highlightactiveline)
	- [highlightSpecialChars](#highlightspecialchars)
	- [highlightWhitespace](#highlightwhitespace)
	- [highlightTrailingWhitespace](#highlighttrailingwhitespace)
	- [escape](#escape)
	- [codeFolding](#codefolding)
	- [tagMatching](#tagmatching)
	- [useMonaco](#usemonaco)

</details>

# Description

This repository contains a modified version of the frontend scripts and styles from [MediaWiki extension CodeMirror](https://www.mediawiki.org/wiki/Extension:CodeMirror). The goal is to support a standalone integration between [CodeMirror](https://codemimrror.net) and [Wikitext](https://www.mediawiki.org/wiki/Wikitext), without the need for a [MediaWiki environment](https://doc.wikimedia.org/mediawiki-core/master/js/).

Here is a [demo](https://bhsd-harry.github.io/codemirror-mediawiki).

Nonetheless, this repository also provides a customized version with additional functionality for use in a MediaWiki site. Browser editing tools such as [Wikiplus-highlight](https://github.com/bhsd-harry/Wikiplus-highlight) and an [InPageEdit plugin](https://github.com/inpageedit/Plugins) are built upon it. Please refer to a separate [README](./mw/README.md) file for the information.

# Usage

You can download the code via CDN, for example:

```js
// static import
import {CodeMirror6} from 'https://cdn.jsdelivr.net/npm/@bhsd/codemirror-mediawiki';
```

or

```js
import {CodeMirror6} from 'https://unpkg.com/@bhsd/codemirror-mediawiki';
```

or

```js
// dynamic import
const {CodeMirror6} = await import('https://cdn.jsdelivr.net/npm/@bhsd/codemirror-mediawiki');
```

or

```js
const {CodeMirror6} = await import('https://unpkg.com/@bhsd/codemirror-mediawiki');
```

# Constructor

<details>
	<summary>Expand</summary>

**param**: `HTMLTextAreaElement` the textarea element to be replaced by CodeMirror  
**param**: `string` the language mode to be used, default as plain text  
**param**: `unknown` the optional language configuration  
**param**: `boolean` whether to initialize immediately, default as true  

```js
const cm = new CodeMirror6(textarea); // plain text
const cm = new CodeMirror6(textarea, 'mediawiki', mwConfig);
const cm = new CodeMirror6(textarea, 'html', mwConfig); // mixed MediaWiki-HTML
const cm = new CodeMirror6(textarea, 'css');
const cm = new CodeMirror6(textarea, 'javascript');
const cm = new CodeMirror6(textarea, 'json');
const cm = new CodeMirror6(textarea, 'lua');
```

</details>

# Accessors

## textarea

<details>
	<summary>Expand</summary>

**type**: `HTMLTextAreaElement`  
The textarea element replaced by CodeMirror, read-only.

</details>

## lang

<details>
	<summary>Expand</summary>

*version added: 2.0.14*

**type**: `string`  
The current language mode, read-only.

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

## extraKeys

<details>
	<summary>Expand</summary>

*version added: 2.2.2*

**param**: [`KeyBinding[]`](https://codemirror.net/docs/ref/#view.KeyBinding) the extra key bindings  
Add extra key bindings.

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
**returns**: `Promise<(doc: Text) => Diagnostic[] | Promise<Diagnostic[]>>`  
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

## initialize

<details>
	<summary>Expand</summary>

*version added: 2.11.0*

**param**: `unknown` the optional language configuration  
Initialize the editor.

```js
cm.initialize();
```

</details>

## lint

<details>
	<summary>Expand</summary>

**param**: `(doc: Text) => Diagnostic[] | Promise<Diagnostic[]>` the linting function  
Set the linting function.

```js
cm.lint(doc => [
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

**param**: `string[] | Record<string, boolean>` the preferred [CodeMirror extensions](https://codemirror.net/docs/extensions/)  
Set the preferred CodeMirror extensions. Available extensions are introduced [later](#extensions).

```js
cm.prefer([
	'allowMultipleSelections',
	'bracketMatching',
	'closeBrackets',
	'highlightActiveLine',
	'highlightSpecialChars',
	'highlightWhitespace',
	'highlightTrailingWhitespace',

	// only available in MediaWiki mode
	'escape',
	'codeFolding',
	'tagMatching',
]);
cm.prefer({
	allowMultipleSelections: false,
	bracketMatching: false,
	closeBrackets: false,
	highlightActiveLine: false,
	highlightSpecialChars: false,
	highlightWhitespace: false,
	highlightTrailingWhitespace: false,

	// only available in MediaWiki mode
	escape: false,
	codeFolding: false,
	tagMatching: false,
});
```

</details>

## scrollTo

<details>
	<summary>Expand</summary>

*version added: 2.6.2*

**param**: [`number | {anchor: number, head: number}`](https://codemirror.net/docs/ref/#state.SelectionRange.anchor) the position or range to scroll to, default as the current cursor position  
Scroll to the given position or range.

```js
cm.scrollTo();
```

</details>

## setContent

<details>
	<summary>Expand</summary>

*version added: 2.1.8*

**param**: `string` new content  
Reset the content of the editor.

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
cm.setLanguage('html', mwConfig); // mixed MediaWiki-HTML
cm.setLanguage('css');
cm.setLanguage('javascript');
cm.setLanguage('json');
cm.setLanguage('lua');
```

</details>

## toggle

<details>
	<summary>Expand</summary>

*version added: 2.1.3*

**param**: `boolean` whether to show the editor, optional  
Switch between the CodeMirror editor and the native textarea.

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

*version added: 2.1.11*

Allow multiple selections.

## autocompletion

*version added: 2.10.0*

Provide autocompletion for MediaWiki, CSS and JavaScript modes.

## bracketMatching

*version added: 2.0.9*

Matched or unmatched brackets are highlighted in cyan or dark red when the cursor is next to them.

## closeBrackets

*version added: 2.0.9*

Automatically close brackets (`{`, `[` and `(`) and quotes (`"`, and `'` except for the MediaWiki mode).

## highlightActiveLine

Highlight the line the cursor is on in light cyan.

## highlightSpecialChars

Show invisible characters as red dots.

## highlightWhitespace

*version added: 2.0.12*

Show spaces and tabs as dots and arrows.

## highlightTrailingWhitespace

*version added: 2.0.9*

Highlight trailing whitespace in a red-orange color.

## escape

*version added: 2.2.2*

Key bindings:

- `Ctrl`/`Cmd` + `[`: Escape the selected text with HTML entities
- `Ctrl`/`Cmd` + `]`: Escape the selected text with URL encoding

## codeFolding

*version added: 2.10.0*

Fold template parameters.

Key bindings:

- `Ctrl` + `Shift` + `[`/`Cmd` + `Alt` + `[`: Fold the selected templates
- `Ctrl` + `Shift` + `]`/`Cmd` + `Alt` + `]`: Unfold the selected templates
- `Ctrl` + `Alt` + `[`: Fold all templates
- `Ctrl` + `Alt` + `]`: Unfold all templates

## tagMatching

*version added: 2.4.1*

Matched or unmatched tags are highlighted in cyan or dark red when the cursor is inside.

## useMonaco

*version added: 2.11.0*

Use the Monaco editor instead of the CodeMirror editor.
