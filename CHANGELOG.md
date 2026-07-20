<!-- markdownlint-disable first-line-h1 -->
## 0.10.1

*2026-07-20*

**Fixed**

- Missing styles for [tag matching](./README.md#bracketmatching)

**Changed**

- Autocompletion for behavior switches now always suggest the uppercase form

## 0.10.0

*2026-07-02*

**Added**

- Highlight `<pre format="wikitext">` tags

## 0.9.1

*2026-06-20*

**Changed**

- Tooltips are now displayed above the associated text

## 0.9.0

*2026-06-11*

**Added**

- The [colorPicker](./README.md#colorpicker) extension now also supports named CSS colors in `style` attributes

## 0.8.1

*2026-06-09*

**Fixed**

- Support BCP 47 language tags in language conversion syntax

## 0.8.0

*2026-06-01*

**Changed**

- [CodeMirror 6](https://codemirror.net/) packages and [wikiparser-node](https://www.npmjs.com/package/wikiparser-node) are now peer dependencies

## 0.7.0

*2026-05-19*

**Added**

- The [wikilint](./README.md#wikilint) extension now reports unknown macros in `<math>` and `<score>` extension tags

## 0.6.0

*2026-05-05*

**Added**

- The [openLinks](./README.md#openlinks) extension now modifies the cursor to indicate when hovering over an openable link

## 0.5.0

*2026-04-30*

**Changed**

- The [@bhsd/codemirror-css-color-picker](https://www.npmjs.com/package/@bhsd/codemirror-css-color-picker) package has been upgraded to v7, which may contain breaking changes for the [colorPicker](./README.md#colorpicker) extension

## 0.4.4

*2026-04-10*

**Fixed**

- Error message in the status bar should not be clickable

## 0.4.3

*2026-03-30*

**Added**

- TeX math syntax highlighting and autocompletion for content inside `<math>`, `<chem>` and `<ce>` tags
- [LilyPond](https://lilypond.org/) syntax highlighting and autocompletion for content inside `<score>` tags
- Commenting with `Mod` + `/` now also works for JSONC content inside `<mapframe>` and `<maplink>` tags and LilyPond content inside `<score>` tags

## 0.4.2

*2026-03-26*

**Added**

- JSON/JSONC content inside `<templatedata>`, `<mapframe>` and `<maplink>` tags is now syntax highlighted
- The [bracketMatching](./README.md#bracketmatching) extension now supports selecting the whole document with quadruple-click

## 0.4.1

*2026-03-24*

**Added**

- The [bracketMatching](./README.md#bracketmatching) extension now supports selecting the line block containing matching brackets with triple-click

## 0.4.0

*2026-03-17*

**Added**

- New extension: [closeTags](./README.md#closetags)

**Fixed**

- Section header styles in certain conditions
- The [bracketMatching](./README.md#bracketmatching) extension for enclosing brackets

## 0.3.2

*2026-03-12*

**Fixed**

- When using the [wikilint](./README.md#wikilint) extension, the status bar now displays the message of the nearest diagnostic overlapping the selected text

## 0.3.1

*2026-03-01*

**Fixed**

- The position indicator in the status bar is now correctly initialized

## 0.3.0

*2026-02-05*

**Added**

- The [signatureHelp](./README.md#signaturehelp) extension now supports dismissing the tooltip with the `Escape` key

**Changed**

- The default CDN for loading the [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) library is now https://fastly.jsdelivr.net

## 0.2.0

*2026-01-25*

**Added**

- [CodeFolding](./README.md#codefolding) keyboard shortcuts now work with sections and tables
- New extensions: [openLinks](./README.md#openlinks) and [bidiIsolates](./README.md#bidiisolates)
- The [wikilint](./README.md#wikilint) extension now includes a status bar which can be hidden via configuration
- External links are now highlighted with underline

**Fixed**

- Non-width image keywords starting with `$1` (e.g., `$1页` in Chinese)
- Missing styles for the [signatureHelp](./README.md#signaturehelp) tooltip
- Highlighting of parser functions and parser function argument names
- [CodeFolding](./README.md#codefolding) for moderately long sections and tables

**Changed**

- Highlighting styles for templates

**Removed**

- The [wikilint](./README.md#wikilint) extension no longer includes [lintGutter](https://codemirror.net/docs/ref/#lint.lintGutter) and [lintKeymap](https://codemirror.net/docs/ref/#lint.lintKeymap)

## 0.1.0

*2026-01-04*

**Added**

- Optional argument to specify linting rules in [wikilint](./README.md#wikilint) extension

**Fixed**

- Italic free external link protocols

**Changed**

- Use semantic highlighting tags

## 0.0.0

*2026-01-03*

- Initial release
