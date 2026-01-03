[![npm version](https://badge.fury.io/js/@bhsd%2Fcodemirror-wikitext.svg)](https://www.npmjs.com/package/@bhsd/codemirror-wikitext)

# @bhsd/codemirror-wikitext

This repository contains a modified Wikitext [language](#mediawikilanguage) from [MediaWiki extension CodeMirror](https://www.mediawiki.org/wiki/Extension:CodeMirror) and various [language support extensions](#extensions).

<details>
	<summary>Expand</summary>

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Language](#language)
	- [mediawikiLanguage](#mediawikilanguage)
- [Keymap](#keymap)
	- [escapeKeymap](#escapekeymap)
	- [formatKeymap](#formatkeymap)
- [Extensions](#extensions)
	- [bracketMatching](#bracketmatching)
	- [codeFolding](#codefolding)
	- [colorPicker](#colorpicker)
	- [hover](#hover)
	- [inlayHints](#inlayhints)
	- [refHover](#refhover)
	- [signatureHelp](#signaturehelp)
	- [wikilint](#wikilint)

</details>

# Installation

You can install the package via npm and import it as a module:

```bash
npm install @bhsd/codemirror-wikitext
```

You may also want to install [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) for pre-defined parser configurations:

```bash
npm install wikiparser-node
```

# Basic Usage

You can simply import the `mediawiki` function to get the Wikitext language with full [language support](https://codemirror.net/docs/ref/#language.LanguageSupport):

```ts
import {mediawiki} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};

const langSupport: LanguageSupport = mediawiki(config);
```

# Language

## mediawikiLanguage

<details>
	<summary>Expand</summary>

You can import the [stream language](https://codemirror.net/docs/ref/#language.StreamLanguage) for Wikitext:

```ts
import {mediawikiLanguage} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};

const lang: StreamLanguage = mediawikiLanguage(config);
```

</details>

# Keymap

## escapeKeymap

<details>
	<summary>Expand</summary>

Key bindings:

- `Ctrl`/`Cmd` + `[`: Escape the selected text with HTML entities
- `Ctrl`/`Cmd` + `]`: Escape the selected text with URL encoding
- `Ctrl`/`Cmd` + `\`: Escape the selected text with [magic words](https://www.mediawiki.org/wiki/Help:Magic_words#Escaped_characters)

```ts
import {escapeKeymap} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};

const keymap: KeyBinding[] = escapeKeymap(config);
```

</details>

## formatKeymap

<details>
	<summary>Expand</summary>

Formatting key bindings:

- `Ctrl` + `0`: Plain paragraph
- `Ctrl` + `1-6`: Headings level 1 to 6
- `Ctrl` + `7`: Preformatted text
- `Ctrl` + `8`: Blockquote
- `Ctrl`/`Cmd` + `/`: Comment
- `Ctrl`/`Cmd` + `.`: Superscript
- `Ctrl`/`Cmd` + `,`: Subscript
- `Ctrl`/`Cmd` + `B`: Bold
- `Ctrl`/`Cmd` + `I`: Italic
- `Ctrl`/`Cmd` + `U`: Underline
- `Ctrl`/`Cmd` + `K`: Wiki link
- `Ctrl` + `Shift` + `5`: Strikethrough
- `Ctrl`/`Cmd` + `Shift` + `6`: Inline code
- `Ctrl`/`Cmd` + `Shift` + `K`: Ref tag

```ts
import {formatKeymap} from '@bhsd/codemirror-wikitext';

const keymap: KeyBinding[] = formatKeymap;
```

</details>

# Extensions

## bracketMatching

<details>
	<summary>Expand</summary>

Matched or unmatched brackets or tags are highlighted in cyan or dark red when the cursor is next to them.

```ts
import {bracketMatching} from '@bhsd/codemirror-wikitext';

const extension: Extension = bracketMatching();
```

</details>

## codeFolding

<details>
	<summary>Expand</summary>

Fold sections, templates, parser functions and extension tags.

Key bindings:

- `Ctrl` + `Shift` + `[`/`Cmd` + `Alt` + `[`: Fold at the selected text
- `Ctrl` + `Shift` + `]`/`Cmd` + `Alt` + `]`: Unfold at the selected text
- `Ctrl` + `Alt` + `[`: Fold all
- `Ctrl` + `Alt` + `]`: Unfold all
- `Ctrl` + `Alt` + `.`: Fold all `<ref>` tags

```ts
import {codeFolding} from '@bhsd/codemirror-wikitext';

const extension: Extension = codeFolding();
```

</details>

## colorPicker

<details>
	<summary>Expand</summary>

Provide color pickers.

```ts
import {colorPicker} from '@bhsd/codemirror-wikitext';

const extension: Extension = colorPicker();
```

</details>

## hover

<details>
	<summary>Expand</summary>

Show the help information of a magic word when hovering.

```ts
import {hover} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};

const extension: Extension = hover(config);
```

</details>

## inlayHints

<details>
	<summary>Expand</summary>

Show inlay hints for anonymous parameters.

```ts
import {inlayHints} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};

const extension: Extension = inlayHints(config);
```

</details>

## refHover

<details>
	<summary>Expand</summary>

Show the content of the `<ref>` tag defined elsewhere when hovering.

```ts
import {refHover} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};

const extension: Extension = refHover(config);
```

</details>

## signatureHelp

<details>
	<summary>Expand</summary>

Show the parser function signature when typing.

```ts
import {signatureHelp} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};

const extension: Extension = signatureHelp(config);
```

</details>

## wikilint

<details>
	<summary>Expand</summary>

Provide syntax diagnostics using [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node).

```ts
import {wikilint} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};

const extension: Extension = wikilint(config);
```

</details>
