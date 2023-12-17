[![npm version](https://badge.fury.io/js/@bhsd%2Fcodemirror-mediawiki.svg)](https://www.npmjs.com/package/@bhsd/codemirror-mediawiki)
[![CodeQL](https://github.com/bhsd-harry/codemirror-mediawiki/actions/workflows/codeql.yml/badge.svg)](https://github.com/bhsd-harry/codemirror-mediawiki/actions/workflows/codeql.yml)

<details>
	<summary>Expand</summary>

- [Description](#description)
- [Usage](#usage)
	- [constructor](#constructor)
	- [textarea](#textarea)
	- [view](#view)
	- [lint](#lint)
	- [prefer](#prefer)
	- [setIndent](#setindent)
	- [setLanguage](#setlanguage)
	- [update](#update)

</details>

# Description

This repository contains a modified version of the frontend scripts and styles from [MediaWiki extension CodeMirror](https://www.mediawiki.org/wiki/Extension:CodeMirror). The goal is to support a standalone integration between [CodeMirror](https://codemimrror.net) and [Wikitext](https://www.mediawiki.org/wiki/Wikitext), without the need for a [MediaWiki environment](https://doc.wikimedia.org/mediawiki-core/master/js/).

Here is a [demo](https://bhsd-harry.github.io/codemirror-mediawiki).

# Usage

You can download the code via CDN, for example:

```js
// static import
import { CodeMirror6 } from 'https://cdn.jsdelivr.net/npm/@bhsd/codemirror-mediawiki@2.0.8/dist/main.min.js';
```

or

```js
// dynamic import
const { CodeMirror6 } = await import( 'https://cdn.jsdelivr.net/npm/@bhsd/codemirror-mediawiki@2.0.8/dist/main.min.js' );
```

## constructor

<details>
	<summary>Expand</summary>

**param**: `HTMLTextAreaElement` the textarea element to be replaced by CodeMirror  
**param**: `string` the language mode to be used, default as plain text  
**param**: `unknown` the optional language configuration  

```js
const cm = new CodeMirror6( textarea, 'css' );
```

</details>

## textarea

<details>
	<summary>Expand</summary>

**type**: `HTMLTextAreaElement`  
The textarea element replaced by CodeMirror.

</details>

## view

<details>
	<summary>Expand</summary>

**type**: [`EditorView`](https://codemirror.net/6/docs/ref/#view.EditorView)  
The CodeMirror EditorView instance.

</details>

## lint

<details>
	<summary>Expand</summary>

**param**: `(str: string) => Diagnostic[] | Promise<Diagnostic[]>` the linting function  
Set the linting function.

```js
cm.lint( ( str ) => [
	/**
	 * @type {Diagnostic}
	 * @see https://codemirror.net/docs/ref/#lint.Diagnostic
	 */
	{
		from: 0,
		to: str.length,
		message: 'error message',
		severity: 'error',
	},
] );
```

</details>

## prefer

<details>
	<summary>Expand</summary>

**param**: `string` the preferred [CodeMirror extensions](https://codemirror.net/docs/extensions/)  
Set the preferred CodeMirror extensions.

```js
cm.prefer( [
	'bracketMatching',
	'closeBrackets',
	'highlightActiveLine',
	'highlightSpecialChars',
	'highlightWhitespace',
	'highlightTrailingWhitespace',
] );
```

</details>

## setIndent

<details>
	<summary>Expand</summary>

**param**: `string` the indentation string, default as tab  
Set the indentation string.

```js
cm.setIndent( ' '.repeat( 2 ) );
```

</details>

## setLanguage

<details>
	<summary>Expand</summary>

**param**: `string` the language mode to be used, default as plain text  
**param**: `unknown` the optional language configuration  
Set the language mode.

```js
cm.setLanguage( 'css' );
```

</details>

## update

<details>
	<summary>Expand</summary>

Refresh linting immediately.

```js
cm.update();
```

</details>
