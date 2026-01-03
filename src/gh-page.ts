import {EditorView, lineNumbers, highlightActiveLineGutter, keymap} from '@codemirror/view';
import {syntaxHighlighting, defaultHighlightStyle, LanguageSupport} from '@codemirror/language';
import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {autocompletion} from '@codemirror/autocomplete';
import {searchKeymap} from '@codemirror/search';
import {mediawikiLanguage, bracketMatching, escape} from './entry';
import type {ConfigData} from 'wikiparser-node';

(async () => {
	const configData: ConfigData = await (await fetch('/wikiparser-node/config/default.json')).json(),
		parent = document.getElementById('wpTextbox')!,
		extensions = [
			new LanguageSupport(
				mediawikiLanguage(configData),
				[
					bracketMatching(),
					autocompletion(),
					escape(configData),
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
		],
		view = new EditorView({parent, extensions});
	Object.assign(globalThis, {view});
})();
