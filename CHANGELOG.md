## v2.7.0

*2024-03-02*

**Added**

- Syntax like `;a:b` in the MediaWiki mode is now correctly highlighted
- Text after `;` in the MediaWiki mode is now highlighted in bold
- Highlighting syntax at SOL in variable default values and parser function arguments in the MediaWiki mode

**Fixed**

- Links and behavior switches are now ignored in table attributes
- Disallow multiline free external links in the MediaWiki mode
- Allow HTML comments in wikilinks and template variables in the MediaWiki mode
- Allow external links in the image caption in the MediaWiki mode
- Apostrophes in wikilinks are now correctly highlighted in the MediaWiki mode
- Allow spaces in the parser function name in the MediaWiki mode

**Changed**

- Now any Wikitext syntax will end the url of an external link in the MediaWiki mode

## v2.6.8

*2024-03-03*

**Added**

- Spell-checking for the MediaWiki mode

**Fixed**

- When used in a MediaWiki site, the editor now correctly memorizes the scroll position after a page reload
- Syntax at SOL in a table cell in the MediaWiki mode, since [v2.6.7](#v267)
- When used in a MediaWiki site, loading multiple visible CodeMirror editors for one textarea element is now prohibited

## v2.6.7

*2024-03-01*

**Added**

- Fostered table content is now highlighted as errors in the MediaWiki mode

**Fixed**

- Syntax like `: {|` in the MediaWiki mode is now correctly highlighted as an indented table
- Multiline table cells in the MediaWiki mode
- Missing underline of template names in the MediaWiki mode

**Changed**

- Keyboard shortcut for [template folding](./README.md#codefolding) (`Ctrl` + `Shift` + `[`/`Cmd` + `Alt` + `[`) now resets the cursor position

## v2.6.6

*2024-02-29*

**Fixed**

- Keyboard shortcut for [template folding](./README.md#codefolding) (`Ctrl` + `Shift` + `[`/`Cmd` + `Alt` + `[`) now works wherever the tooltip is displayed

## v2.6.5

*2024-02-27*

**Fixed**

- Onclick event of the placeholder of the [codeFolding](./README.md#codefolding) extension
- Multiple WikiEditor toolbars in certain conditions

**Changed**

- Now an unmatched closing HTML tag will not influence the stack

## v2.6.4

*2024-02-26*

**Added**

- A simple linter for JSON

**Fixed**

- Unintentional change of the first checkbox due to click within the MediaWiki-site preference dialog

## v2.6.3

*2024-02-24*

**Added**

- New static property: [`version`](./mw/README.md#version)

**Fixed**

- Luaparse now parses Lua 5.3

**Changed**

- When used in a MediaWiki site, ESLint now treats `mw`, `$` and `OO` as global variables

## v2.6.2

*2024-02-24*

**Added**

- New method: [`scrollTo`](./README.md#scrollto)
- The preference dialog in a MediaWiki site adds new tabs for ESLint and Stylelint configurations

**Fixed**

- In the MediaWiki mode, a valid tag name now must end with `/[>/\s]/`.

## v2.6.1

*2024-02-22*

**Fixed**

- Interaction between the [tagMatching](./README.md#tagmatching) extension and uncustomized extension tags

## v2.6.0

*2024-02-22*

**Added**

- The preference dialog in a MediaWiki site adds a new tab for WikiLint configurations

## v2.5.1

*2024-02-21*

**Added**

- New extension option for the MediaWiki mode: [autocompletion](./README.md#autocompletion)
- ESLint and Stylelint now provide auto-fix suggestions

## v2.4.7

*2024-02-12*

**Added**

- New static method: [`getMwConfig`](./README.md#getmwconfig)

**Fixed**

- The [openLinks](./mw/README.md#openlinks) extension now correctly detects page names with `&`

**Changed**

- The placeholder of the [codeFolding](./README.md#codefolding) extension now contains a leading `|`

## v2.4.5

*2024-02-07*

**Added**

- New extension option for the MediaWiki mode: [wikiEditor](./mw/README.md#wikieditor)

## v2.4.2

*2024-02-06*

**Added**

- New method: [`getNodeAt`](./README.md#getnodeat)

**Changed**

- The [openLinks](./mw/README.md#openlinks) extension now utilizes the syntax tree to detect page names

## v2.4.1

*2024-02-06*

**Added**

- New extension option for the MediaWiki mode: [tagMatching](./README.md#tagmatching)

## v2.3.5

*2024-02-05*

**Added**

- Keyboard shortcuts for unfold and unfold-all

**Fixed**

- Folding a long template or a nested template

## v2.3.3

*2024-02-04*

**Added**

- New method: [`localize`](./README.md#localize)
- The search dialog is now localized when used in a MediaWiki site

**Fixed**

- The keyboard shortcut for template folding now closes the tooltip.

## v2.3.0

*2024-02-02*

**Added**

- New extension option for the MediaWiki mode: [codeFolding](./README.md#codefolding)
- When used in a MediaWiki site, a welcome message will be sent

## v2.2.3

*2024-02-01*

**Added**

- The MediaWiki mode now has a comment syntax: `<!--` + `-->`
- The preference dialog in a MediaWiki site now allows for full-HTML labels

## v2.2.2

*2024-02-01*

**Added**

- New extension option for the MediaWiki mode: [escape](./README.md#escape)
- New method: [`extraKeys`](./README.md#extrakeys)
- New static method: [`replaceSelections`](./README.md#replaceselections)
- Now in a MediaWiki site, a user can toggle extensions on and off with a dialog

**Changed**

- [`fromTextArea`](./mw/README.md#fromtextarea) now takes one more optional argument of the namespace id

## v2.1.15

*2024-01-30*

**Added**

- New extension option for the MediaWiki mode: [openLinks](./mw/README.md#openlinks)

**Changed**

- [`prefer`](./README.md#prefer) now takes either an array of strings or an object as the argument

## v2.1.12

*2024-01-27*

**Added**

- [defaultLint](./mw/README.md#defaultlint) now detects the user's language preference

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
- [defaultLint](./mw/README.md#defaultlint) can take a namespace id as a second argument in place of a configuration object

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
- The MediaWiki-site version now automatically detects the language on editing pages

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
