<!-- markdownlint-disable first-line-h1 -->
## 0.2.0

*2026-01-25*

**Added**

- [CodeFolding](./README.md#codefolding) keyboard shortcuts now work with sections and tables
- New extensions: [openLinks](./README.md#openlinks) and [bidiIsolates](./README.md#bidiisolates)
- The [wikilint](./README.md#wikilint) extension now includes a status bar which can be hidden via configuration
- External links are now highlighted with underline

**Fixed**

- Non-width image keywords starting with `$1` (e.g., `$1页` in Chinese)
- Missing styles for the [signatureHelp](./README.md#signaturehelp) tooltip in the MediaWiki mode
- Highlighting of parser functions and parser function argument names in the MediaWiki mode
- [CodeFolding](./README.md#codefolding) for moderately long sections and tables in the MediaWiki mode

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
