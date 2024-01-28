## v2.1.13

*2024-01-28*

**Changed**

- [`prefer`](./README.md#prefer) now takes either an array of strings or an object as the argument

## v2.1.12

*2024-01-27*

**Fixed**

- Now the editor and the textarea element are synced in selection, focus and scroll position when toggling

**Changed**

- [`getLinter`](./README.md#getlinter) temporarily disabling the warning of low-severity lint errors for Wikitext until the next minor version

## v2.1.11

*2024-01-22*

**Added**

- New extension option: [allowMultipleSelections](https://codemirror.net/docs/ref/#state.EditorState^allowMultipleSelections)

## v2.1.10

*2024-01-19*

**Fixed**

- A valid external link requires at least one legal character after the protocol
- Attribute delimiter of table captions and table cells
- Unmatched closing tag

## v2.1.9

*2024-01-18*

**Added**

- [lintKeymap](https://codemirror.net/docs/ref/#lint.lintKeymap)

**Fixed**

- No more auto-focusing on the lint panel
- `'/'` in HTML and extension tag attributes, since [v2.1.0](#v210)

## v2.1.8

*2024-01-17*

**Added**

- New method: [`setContent`](./README.md#setcontent)

**Changed**

- Reseting the editor size in [`toggle`](./README.md#toggle) method

## v2.1.5

*2024-01-15*

**Added**

- More permitted HTML tags in the mixed MediaWiki-HTML mode

## v2.1.3

*2024-01-14*

**Added**

- New property: [`visible`](./README.md#visible)
- New method: [`toggle`](./README.md#toggle)
- [`getLinter`](./README.md#getlinter) now takes an optional configuration argument

## v2.1.2

*2024-01-13*

**Added**

- Language support for JSON
- Read-only mode

## v2.1.0

*2024-01-13*

**Added**

- Accurate HTML entity recognition
- File link with multiple parameters and links in the caption
- `{{!}}` in table syntax
- Warning for illegal characters in link or template page names
- `<dt>` using `;`

**Fixed**

- Multiline closing extension tags
- Punctuations in free external links
- Multiple table captions
- Syntax like `[[a|[b]]]`
- HTML5 standard for invalid auto-closing tags
- Missing ground styles in some conditions
- Mistakenly recognized `<!--` (e.g., `<b!--`)
- Multiple template variable default values
- Removing the `u` flag from `MediaWiki.urlProtocols`

## v2.0.15

*2024-01-11*

**Fixed**

- Missing token styles

## v2.0.14

*2023-12-20*

**Added**

- New property: [`lang`](./README.md#lang)
- New method: [`getLinter`](./README.md#getlinter)
- First integration with [MediaWiki environment](https://doc.wikimedia.org/mediawiki-core/master/js/)

**Fixed**

- Initial scrollTop of the editor

**Changed**

- The argument type of [`lint`](./README.md#lint) method

## v2.0.12

*2023-12-17*

**Added**

- New extension option: [highlightWhitespace](https://codemirror.net/docs/ref/#view.highlightWhitespace)
- The textarea element now syncs with the editor

**Fixed**

- Highlight styles for Wikitext no longer contaminate other languages
- More robust DOM structure

**Changed**

- The lint panel is now open by default

**Removed**

- `save` method

## v2.0.9

*2023-12-16*

**Added**

- Language support for Lua
- New extension options: [highlightTrailingWhitespace](https://codemirror.net/docs/ref/#view.highlightTrailingWhitespace), [bracketMatching](https://codemirror.net/docs/ref/#language.bracketMatching) and [closeBrackets](https://codemirror.net/docs/ref/#autocomplete.closeBrackets)
- New methods: [`prefer`](./README.md#prefer) and [`setIndent`](./README.md#setindent)

**Fixed**

- Initial height of the editor

## v2.0.7

*2023-12-14*

**Added**

- [CodeMirror 6](https://codemirror.net) support
- Language support for [Wikitext](https://www.mediawiki.org/wiki/Wikitext), JavaScript and CSS
- Extension options: [highlightSpecialChars](https://codemirror.net/docs/ref/#view.highlightSpecialChars) and [highlightActiveLine](https://codemirror.net/docs/ref/#view.highlightActiveLine)
