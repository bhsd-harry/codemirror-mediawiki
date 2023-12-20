## v2.0.14

*2023-12-20*

**Added**

- New property: [`lang`](./README#lang)
- New method: [`getLinter`](./README#getlinter)
- First integration with [MediaWiki environment](https://doc.wikimedia.org/mediawiki-core/master/js/)

**Fixed**

- Initial scrollTop of the editor

**Changed**

- The argument type of [`lint`](./README#lint) method

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
- New methods: [`prefer`](./README#prefer) and [`setIndent`](./README#setindent)

**Fixed**

- Initial height of the editor

## v2.0.7

*2023-12-14*

**Added**

- [CodeMirror 6](https://codemirror.net) support
- Language support for [Wikitext](https://www.mediawiki.org/wiki/Wikitext), JavaScript and CSS
- Extension options: [highlightSpecialChars](https://codemirror.net/docs/ref/#view.highlightSpecialChars) and [highlightActiveLine](https://codemirror.net/docs/ref/#view.highlightActiveLine)
