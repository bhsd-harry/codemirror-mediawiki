<details>
	<summary>Expand</summary>

- [Usage](#usage)
- [Constructor](#constructor)
- [Accessors](#accessors)
	- [editor](#editor)
	- [model](#model)
	- [$toolbar](#toolbar)
- [Methods](#methods)
	- [defaultLint](#defaultlint)
	- [getContent](#getcontent)
- [Static properties](#static-properties)
	- [version](#version)
- [Static methods](#static-methods)
	- [fromTextArea](#fromtextarea)
- [Extensions](#extensions)
	- [wikiEditor](#wikieditor)
	- [save](#save)
	- [useMonaco](#usemonaco)
- [Integration with editors](#integration-with-editors)
	- [Native WikiEditor](#native-wikieditor)
	- [Wikiplus](#wikiplus)
	- [InPageEdit-Next](#inpageedit-next)

</details>

# Usage

You can download the code via CDN on a MediaWiki site, for example:

```js
mw.loader.load('https://cdn.jsdelivr.net/npm/@bhsd/codemirror-mediawiki/dist/wiki.min.js');
```

or

```js
mw.loader.load('https://unpkg.com/@bhsd/codemirror-mediawiki/dist/wiki.min.js');
```

All supported [languages](../README#language-modes) are included in this bundle. The script also adds a button to configure user preferences, and watches `Shift`-clicks of any textarea.

# Constructor

<details>
	<summary>Expand</summary>

*version added: 2.2.2*

The `CodeMirror` class extends the [`CodeMirror6`](../README.md#constructor) class with one more argument to specify the namespace.

**param**: `HTMLTextAreaElement` the textarea element to be replaced by CodeMirror  
**param**: `string` the language mode to be used, default as plain text  
**param**: `number` the namespace id associated with the content, default as the current namespace  
**param**: `unknown` the language configuration, only required for the MediaWiki mode and the mixed MediaWiki-HTML mode  
**param**: `boolean` whether to use CodeMirror or Monaco editor, default as CodeMirror  
**param**: `string` the optional page title, default as the current page title  

```js
let cm;
cm = new CodeMirror6(textarea); // plain text
cm = new CodeMirror6(textarea, 'mediawiki', undefined, mwConfig);
cm = new CodeMirror6(textarea, 'html', 274, mwConfig);
cm = new CodeMirror6(textarea, 'css');
cm = new CodeMirror6(textarea, 'javascript');
cm = new CodeMirror6(textarea, 'json');
cm = new CodeMirror6(textarea, 'lua');
```

</details>

# Accessors

The `CodeMirror` class inherits all the [accessors](../README.md#accessors) from the `CodeMirror6` class.

## editor

<details>
	<summary>Expand</summary>

*version added: 2.11.1*

**type**: [`Monaco.editor.IStandaloneCodeEditor | undefined`](https://microsoft.github.io/monaco-editor/docs.html#interfaces/editor.IStandaloneCodeEditor.html)  
The Monaco editor instance.

</details>

## model

<details>
	<summary>Expand</summary>

*version added: 2.11.1*

**type**: [`Monaco.editor.ITextModel | undefined`](https://microsoft.github.io/monaco-editor/docs.html#interfaces/editor.ITextModel.html)  
The Monaco text model instance.

</details>

## $toolbar

<details>
	<summary>Expand</summary>

*version added: 2.28.0*

**type**: [`JQuery | undefined`](https://api.jquery.com/)  
The WikiEditor toolbar instance.

</details>

# Methods

The `CodeMirror` class inherits all the [methods](../README.md#methods) from the `CodeMirror6` class and addes more.

## defaultLint

<details>
	<summary>Expand</summary>

*version added: 2.1.9*

**param**: `boolean` whether to start linting  
Lint the CodeMirror editor with a default linter.

```js
cm.defaultLint(true);
```

</details>

## getContent

<details>
	<summary>Expand</summary>

*version added: 2.11.1*

**returns**: `string`  
Get the content of the editor.

```js
cm.getContent();
```

</details>

# Static properties

## monacoVersion

<details>
	<summary>Expand</summary>

*version added: 3.8.0*

**type**: `string`  
You can set this property to specify the version of [Monaco-Wiki](https://www.npmjs.com/package/monaco-wiki) to be used. The default value is `latest`.

</details>

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
**param**: `string` the optional page title, default as the current page title  
**param**: `string[]` the optional list of additional extensions to be enabled  
**returns**: `Promise<CodeMirror>`  
Replace the textarea with a CodeMirror or Monaco editor.

```js
CodeMirror6.fromTextArea(textarea, 'mediawiki');
CodeMirror6.fromTextArea(textarea, 'html');
CodeMirror6.fromTextArea(textarea, 'css');
CodeMirror6.fromTextArea(textarea, 'javascript');
CodeMirror6.fromTextArea(textarea, 'json');
CodeMirror6.fromTextArea(textarea, 'lua');
```

</details>

# Extensions

The `CodeMirror` class inherits all the [extensions](../README.md#extensions) from the `CodeMirror6` class and addes more.

## wikiEditor

*version added: 2.4.5*

Load the WikiEditor toolbar. This extension can only be used before CodeMirror instantiation, which means it is inaccessible by the [`prefer`](../README.md#prefer) method.

## save

*version added: 2.7.0*

Save preferences as JSON on a user subpage (`Special:Mypage/codemirror-mediawiki.json`).

## useMonaco

*version added: 2.11.1*

Use the Monaco editor instead of the CodeMirror editor.

# Integration with editors

## Native WikiEditor

```js
mw.hook('wikipage.editform').add($form => {
	CodeMirror6.fromTextArea($form.find('textarea')[0]);
});
```

## [Wikiplus](https://www.npmjs.com/package/wikiplus-core)

Please see [Wikiplus-highlight](https://www.npmjs.com/package/wikiplus-highlight).

## [InPageEdit Next](https://www.npmjs.com/package/@inpageedit/core)

Please enable the CodeMirror integration in the plugin store.
