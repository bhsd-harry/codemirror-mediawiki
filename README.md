# @bhsd/codemirror-wikitext

[![npm version](https://badge.fury.io/js/@bhsd%2Fcodemirror-wikitext.svg)](https://www.npmjs.com/package/@bhsd/codemirror-wikitext)
[![CodeQL](https://github.com/bhsd-harry/codemirror-mediawiki/actions/workflows/codeql.yml/badge.svg)](https://github.com/bhsd-harry/codemirror-mediawiki/actions/workflows/codeql.yml)

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
	- [bidiIsolates](#bidiisolates)
	- [bracketMatching](#bracketmatching)
	- [codeFolding](#codefolding)
	- [colorPicker](#colorpicker)
	- [hover](#hover)
	- [inlayHints](#inlayhints)
	- [openLinks](#openlinks)
	- [refHover](#refhover)
	- [signatureHelp](#signaturehelp)
	- [wikilint](#wikilint)

</details>

## Installation

You can install the package via npm and import it as a module:

```bash
npm install @bhsd/codemirror-wikitext
```

You may also want to install [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) for pre-defined parser configurations:

```bash
npm install wikiparser-node
```

## Basic Usage

You can simply import the `mediawiki` function to get the Wikitext language with full [language support](#extensions):

```ts
import {mediawiki} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};
import type {LanguageSupport} from '@codemirror/language';

const langSupport: LanguageSupport = mediawiki(
	config,
	// (optional) specify the jsDelivr CDN for loading assets, default to https://testingcf.jsdelivr.net
	'https://cdn.jsdelivr.net',
);
```

Here is an online [demo](https://bhsd-harry.github.io/codemirror-mediawiki/wikitext).

## Language

### mediawikiLanguage

<details>
	<summary>Expand</summary>

You can import the [stream language](https://codemirror.net/docs/ref/#language.StreamLanguage) for Wikitext:

```ts
import {mediawikiLanguage} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};
import type {StreamLanguage} from '@codemirror/language';

const lang: StreamLanguage = mediawikiLanguage(config);
```

</details>

## Keymap

### escapeKeymap

<details>
	<summary>Expand</summary>

Key bindings:

- `Ctrl`/`Cmd` + `[`: Escape the selected text with HTML entities
- `Ctrl`/`Cmd` + `]`: Escape the selected text with URL encoding
- `Ctrl`/`Cmd` + `\`: Escape the selected text with [magic words](https://www.mediawiki.org/wiki/Help:Magic_words#Escaped_characters)

```ts
import {escapeKeymap} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};
import type {KeyBinding} from '@codemirror/view';

const keymap: KeyBinding[] = escapeKeymap(
	config,
	// (optional) specify the jsDelivr CDN for loading assets, default to https://testingcf.jsdelivr.net
	'https://cdn.jsdelivr.net',
);
```

</details>

### formatKeymap

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
import type {KeyBinding} from '@codemirror/view';

const keymap: KeyBinding[] = formatKeymap;
```

</details>

## Extensions

### bidiIsolates

<details>
	<summary>Expand</summary>

*version added: 0.2.0*

When the editor contains right-to-left text, isolate bidirectional text from the surrounding text. This extension is not included in the default [`mediawiki`](#basic-usage) language support.

```ts
import {bidiIsolates} from '@bhsd/codemirror-wikitext';
import type {Extension} from '@codemirror/state';

const extension: Extension = bidiIsolates();
```

</details>

### bracketMatching

<details>
	<summary>Expand</summary>

Matched or unmatched brackets or tags are highlighted in cyan or dark red when the cursor is next to them.

```ts
import {bracketMatching} from '@bhsd/codemirror-wikitext';
import type {Extension} from '@codemirror/state';

const extension: Extension = bracketMatching();
```

</details>

### codeFolding

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
import type {Extension} from '@codemirror/state';

const extension: Extension = codeFolding();
```

</details>

### colorPicker

<details>
	<summary>Expand</summary>

Provide color pickers.

```ts
import {colorPicker} from '@bhsd/codemirror-wikitext';
import type {Extension} from '@codemirror/state';

const extension: Extension = colorPicker();
```

</details>

### hover

<details>
	<summary>Expand</summary>

Show the help information of a magic word when hovering.

```ts
import {hover} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};
import type {Extension} from '@codemirror/state';

const extension: Extension = hover(
	config,
	// (optional) specify the jsDelivr CDN for loading assets, default to https://testingcf.jsdelivr.net
	'https://cdn.jsdelivr.net',
);
```

</details>

### inlayHints

<details>
	<summary>Expand</summary>

Show inlay hints for anonymous parameters.

```ts
import {inlayHints} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};
import type {Extension} from '@codemirror/state';

const extension: Extension = inlayHints(
	config,
	// (optional) specify the jsDelivr CDN for loading assets, default to https://testingcf.jsdelivr.net
	'https://cdn.jsdelivr.net',
);
```

</details>

### openLinks

<details>
	<summary>Expand</summary>

*version added: 0.2.0*

CTRL/CMD-click opens a link in a new tab.

```ts
import {openLinks} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};
import type {Extension} from '@codemirror/state';

const extension: Extension = openLinks(config);
```

</details>

### refHover

<details>
	<summary>Expand</summary>

Show the content of the `<ref>` tag defined elsewhere when hovering.

```ts
import {refHover} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};
import type {Extension} from '@codemirror/state';

const extension: Extension = refHover(
	config,
	// (optional) specify the jsDelivr CDN for loading assets, default to https://testingcf.jsdelivr.net
	'https://cdn.jsdelivr.net',
);
```

</details>

### signatureHelp

<details>
	<summary>Expand</summary>

Show the parser function signature when typing.

```ts
import {signatureHelp} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};
import type {Extension} from '@codemirror/state';

const extension: Extension = signatureHelp(
	config,
	// (optional) specify the jsDelivr CDN for loading assets, default to https://testingcf.jsdelivr.net
	'https://cdn.jsdelivr.net',
);
```

</details>

### wikilint

<details>
	<summary>Expand</summary>

Provide syntax diagnostics using [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node).

```ts
import {wikilint} from '@bhsd/codemirror-wikitext';
import config from 'wikiparser-node/config/default.json' with {type: 'json'};
import type {Extension} from '@codemirror/state';

const extension: Extension = wikilint(
	config,
	// (optional) specify the linting config; see https://github.com/bhsd-harry/wikiparser-node/wiki/Rules#configuration
	// In particular, Stylelint will not be loaded if the 'invalid-css' rule is disabled.
	{
		rules: {'invalid-css': 0},
		// (optional) hide the status bar
		statusBar: false,
	},
	// (optional) specify the jsDelivr CDN for loading assets, default to https://testingcf.jsdelivr.net
	'https://cdn.jsdelivr.net',
);
```

</details>
