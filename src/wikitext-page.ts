import {EditorView, lineNumbers, highlightActiveLineGutter, keymap} from '@codemirror/view';
import {syntaxHighlighting, defaultHighlightStyle, LanguageSupport} from '@codemirror/language';
import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {autocompletion} from '@codemirror/autocomplete';
import {searchKeymap} from '@codemirror/search';
import {lintGutter} from '@codemirror/lint';
import {
	mediawikiLanguage,
	bracketMatching,
	escapeKeymap,
	refHover,
	hover,
	signatureHelp,
	inlayHints,
	formatKeymap,
	colorPicker,
	codeFolding,
	openLinks,
	closeTags,
	wikilint,
} from './index';
import type {ConfigData} from 'wikiparser-node';

(async () => {
	const configData: ConfigData = {
			...await (await fetch('/wikiparser-node/config/default.json')).json(),
			articlePath: 'https://www.mediawiki.org/wiki/$1',
		},
		parent = document.getElementById('wpTextbox')!;
	const extensions = [
			new LanguageSupport(
				mediawikiLanguage(configData),
				[
					keymap.of([
						...formatKeymap,
						...escapeKeymap(configData),
					]),
					bracketMatching(),
					autocompletion(),
					closeTags(),
					refHover(configData),
					hover(configData),
					signatureHelp(configData),
					inlayHints(configData),
					colorPicker(),
					codeFolding(),
					openLinks(configData),
					wikilint(configData, {'invalid-css': 1, 'arg-in-ext': 2}),
				],
			),
			syntaxHighlighting(defaultHighlightStyle),
			EditorView.lineWrapping,
			lineNumbers(),
			highlightActiveLineGutter(),
			keymap.of([
				...defaultKeymap,
				...searchKeymap,
				...historyKeymap,
				indentWithTab,
			]),
			history(),
			lintGutter(),
		],
		view = new EditorView({parent, extensions});
	Object.assign(globalThis, {view});
})();
