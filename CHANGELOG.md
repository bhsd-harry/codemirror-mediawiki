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
