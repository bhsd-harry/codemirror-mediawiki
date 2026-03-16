<!-- markdownlint-disable first-line-h1 -->
## 0.4.0

*2026-03-16*

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
