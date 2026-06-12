<details>
	<summary>Expand</summary>

- [Usage](#usage)
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
- [Preference dialog](#preference-dialog)
	- [ESLint](#eslint)
	- [Stylelint](#stylelint)
	- [Luacheck](#luacheck)
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

All supported [languages](../README.md#language-modes) are included in this bundle. The script also adds a button to configure user preferences, and watches `Shift`-clicks of any textarea.

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
**param**: `{ns?: number, page?: string, extensions?: string[]}` the namespace id and the page title associated with the content, and an optional list of additional extensions to be enabled  
**returns**: `Promise<CodeMirror>`  
Replace the textarea with a CodeMirror or Monaco editor.

```js
CodeMirror6.fromTextArea(textarea, 'mediawiki');
CodeMirror6.fromTextArea(textarea, 'html');
CodeMirror6.fromTextArea(textarea, 'css');
CodeMirror6.fromTextArea(textarea, 'javascript');
CodeMirror6.fromTextArea(textarea, 'json');
CodeMirror6.fromTextArea(textarea, 'jsonc');
CodeMirror6.fromTextArea(textarea, 'lua');
CodeMirror6.fromTextArea(textarea, 'vue');
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

# Preference dialog

Users can configure their preferences in a multi-tab dialog. The first tab is for general settings with checkboxes and dropdowns to enable or disable certain features. The next tabs are for language-specific linter settings, which are either dropdowns or textareas depending on the linter. For linters configured with textareas (including [ESLint](#eslint), [Stylelint](#stylelint) and [Luacheck](#luacheck)), only valid JSON input is accepted.

## ESLint

ESLint is used for linting [JavaScript](../README.md#javascript) code, including the code embedded in `<script>` tags in [HTML](../README.md#html) and [Vue](../README.md#vue) modes. It can be configured with a JSON input in the legacy [eslintrc format](https://eslint.org/docs/v8.x/use/configure/). In particular, [`eslint:recommended`](https://eslint.org/docs/v8.x/use/configure/configuration-files#using-eslintrecommended) is supported and is the default.

## Stylelint

Stylelint is used for linting [CSS](../README.md#css) code, including the code embedded in `<style>` tags in [HTML](../README.md#html) and [Vue](../README.md#vue) modes and the code in `style` attributes in [MediaWiki](../README.md#mediawiki) and [HTML](../README.md#html) modes. It can be [configured](https://stylelint.io/user-guide/configure/) with a JSON input. In particular, [`stylelint-config-recommended`](https://www.npmjs.com/package/stylelint-config-recommended) is supported and is the default.

## Luacheck

Luacheck is used for linting [Lua](../README.md#lua) code. It can be [configured](https://luacheck.readthedocs.io/en/stable/config.html#config-options) with a JSON input. In particular, a custom set of standard globals named `mediawiki` is provided for the [Scribunto](https://www.mediawiki.org/wiki/Extension:Scribunto) environment and is the default.

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
