[![npm version](https://badge.fury.io/js/@bhsd%2Fcodemirror-mediawiki.svg)](https://www.npmjs.com/package/@bhsd/codemirror-mediawiki)
[![CodeQL](https://github.com/bhsd-harry/codemirror-mediawiki/actions/workflows/codeql.yml/badge.svg)](https://github.com/bhsd-harry/codemirror-mediawiki/actions/workflows/codeql.yml)

<details>
	<summary>Expand</summary>

- [Description](#description)
- [Usage](#usage)
	- [constructor](#constructor)
	- [textarea](#textarea)
	- [lang](#lang)
	- [view](#view)
	- [visible](#visible)
	- [getLinter](#getlinter)
	- [lint](#lint)
	- [prefer](#prefer)
	- [setContent](#setcontent)
	- [setIndent](#setindent)
	- [setLanguage](#setlanguage)
	- [toggle](#toggle)
	- [update](#update)

</details>

# Description

This repository contains a modified version of the frontend scripts and styles from [MediaWiki extension CodeMirror](https://www.mediawiki.org/wiki/Extension:CodeMirror). The goal is to support a standalone integration between [CodeMirror](https://codemimrror.net) and [Wikitext](https://www.mediawiki.org/wiki/Wikitext), without the need for a [MediaWiki environment](https://doc.wikimedia.org/mediawiki-core/master/js/).

Here is a [demo](https://bhsd-harry.github.io/codemirror-mediawiki).

# Usage

You can download the code via CDN, for example:

```js
// static import
import {CodeMirror6} from 'https://cdn.jsdelivr.net/npm/@bhsd/codemirror-mediawiki/dist/main.min.js';
```

or

```js
// dynamic import
const {CodeMirror6} = await import('https://cdn.jsdelivr.net/npm/@bhsd/codemirror-mediawiki/dist/main.min.js');
```

## constructor

<details>
	<summary>Expand</summary>

**param**: `HTMLTextAreaElement` the textarea element to be replaced by CodeMirror  
**param**: `string` the language mode to be used, default as plain text  
**param**: `unknown` the optional language configuration  

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

## textarea

<details>
	<summary>Expand</summary>

**type**: `HTMLTextAreaElement`  
The textarea element replaced by CodeMirror, read-only.

</details>

## lang

<details>
	<summary>Expand</summary>

*version added: 2.0.13*

**type**: `string`  
The current language mode, read-only.

</details>

## view

<details>
	<summary>Expand</summary>

**type**: [`EditorView`](https://codemirror.net/6/docs/ref/#view.EditorView)  
The CodeMirror EditorView instance, read-only.

</details>

## visible

<details>
	<summary>Expand</summary>

*version added: 2.1.3*

**type**: `boolean`  
Whether the editor is visible, read-only.

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

## prefer

<details>
	<summary>Expand</summary>

*version added: 2.0.9*

**param**: `string[] | Record<string, boolean>` the preferred [CodeMirror extensions](https://codemirror.net/docs/extensions/)  
Set the preferred CodeMirror extensions.

```js
cm.prefer([
	'allowMultipleSelections',
	'bracketMatching',
	'closeBrackets',
	'highlightActiveLine',
	'highlightSpecialChars',
	'highlightWhitespace',
	'highlightTrailingWhitespace',
]);
cm.prefer({
	allowMultipleSelections: false,
	bracketMatching: false,
	closeBrackets: false,
	highlightActiveLine: false,
	highlightSpecialChars: false,
	highlightWhitespace: false,
	highlightTrailingWhitespace: false,
});
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

*version added: 2.0.8*

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
