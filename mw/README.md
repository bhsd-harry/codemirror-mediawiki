<details>
	<summary>Expand</summary>

- [Usage](#usage)
- [Constructor](#constructor)
- [Accessors](#accessors)
- [Methods](#methods)
	- [defaultLint](#defaultlint)
- [Static properties](#static-properties)
	- [version](#version)
- [Static methods](#static-methods)
	- [fromTextArea](#fromtextarea)
- [Extensions](#extensions)
	- [openLinks](#openlinks)
	- [wikiEditor](#wikieditor)
	- [save](#save)

</details>

# Usage

You can download the code via CDN, for example:

```js
// static import
import {CodeMirror} from 'https://cdn.jsdelivr.net/npm/@bhsd/codemirror-mediawiki/dist/mw.min.js';
```

or

```js
import {CodeMirror} from 'https://unpkg.com/@bhsd/codemirror-mediawiki/dist/mw.min.js';
```

or

```js
// dynamic import
const {CodeMirror} = await import('https://cdn.jsdelivr.net/npm/@bhsd/codemirror-mediawiki/dist/mw.min.js');
```

or

```js
const {CodeMirror} = await import('https://unpkg.com/@bhsd/codemirror-mediawiki/dist/mw.min.js');
```

The script also loads the [styles](../mediawiki.css), adds a button to configure user preferences, and watches `Shift`-clicks of any textarea.

# Constructor

<details>
	<summary>Expand</summary>

*version added: 2.2.2*

The `CodeMirror` class extends the [`CodeMirror6`](../README.md#constructor) class with one more argument to specify the namespace.

**param**: `HTMLTextAreaElement` the textarea element to be replaced by CodeMirror  
**param**: `string` the language mode to be used, default as plain text  
**param**: `number` the namespace id associated with the content, default as the current namespace  
**param**: `unknown` the optional language configuration  

```js
const cm = new CodeMirror6(textarea); // plain text
const cm = new CodeMirror6(textarea, 'mediawiki', undefined, mwConfig);
const cm = new CodeMirror6(textarea, 'html', 274, mwConfig); // mixed MediaWiki-HTML
const cm = new CodeMirror6(textarea, 'css');
const cm = new CodeMirror6(textarea, 'javascript');
const cm = new CodeMirror6(textarea, 'json');
const cm = new CodeMirror6(textarea, 'lua');
```

</details>

# Accessors

The `CodeMirror` class inherits all the [accessors](../README.md#accessors) from the `CodeMirror6` class.

# Methods

The `CodeMirror` class inherits all the [methods](../README.md#methods) from the `CodeMirror6` class and addes more.

## defaultLint

<details>
	<summary>Expand</summary>

*version added: 2.1.9*

**param**: `boolean` whether to start linting  
**param**: `Record<string, unknown> | number` the optional linter configuration or the namespace id  
Lint with a default linter.

```js
cm.defaultLint(true, 0);
```

</details>

# Static properties

## version

<details>
	<summary>Expand</summary>

*version added: 2.6.3*

**type**: `string`  
The version number.
</details>

# Static methods

The `CodeMirror` class inherits all the [static methods](../README.md#static-methods) from the `CodeMirror6` class and addes more.

## fromTextArea

<details>
	<summary>Expand</summary>

*version added: 2.2.2*

**param**: `HTMLTextAreaElement` the textarea element to be replaced by CodeMirror  
**param**: `string` the language mode to be used, default as plain text  
**param**: `number` the namespace id associated with the content, default as the current namespace  
Replace the textarea with CodeMirror editor.

```js
CodeMirror6.fromTextArea(textarea, 'mediawiki');
```

</details>

# Extensions

The `CodeMirror` class inherits all the [extensions](../README.md#extensions) from the `CodeMirror6` class and addes more.

## openLinks

*version added: 2.1.15*

CTRL/CMD-click opens a wikilink or template or external link in a new tab.

## wikiEditor

*version added: 2.4.5*

Load the WikiEditor toolbar. This extension can only be used before CodeMirror instantiation, which means it is inaccessible by the [`prefer`](../README.md#prefer) method.

## save

*version added: 2.7.0*

Save preferences as JSON on a user subpage (`Special:Mypage/codemirror-mediawiki.json`).
