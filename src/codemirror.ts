import {
	EditorSelection,
} from '@codemirror/state';
import {
	linter,
} from '@codemirror/lint';
import elt from 'crelt';
import {
	diagnosticSelector,
} from './constants.js';
import {
	updateCDN,
} from './util.js';
import {getWikiLintSource} from './lintsource.js';
import statusBar from './statusBar.js';
import type {
	EditorView,
} from '@codemirror/view';
import type {
	Extension,
} from '@codemirror/state';
import type {Diagnostic} from '@codemirror/lint';
import type {
	ConfigData,
	LintConfig as LintConfigBase,
} from 'wikiparser-node';
import type {DocRange} from './util';

declare type LintConfig = Extract<LintConfigBase, {h1?: unknown}>
	| Extract<LintConfigBase, {rules: unknown}> & {statusBar?: boolean};

export type ReplaceFunction = (str: string, range: DocRange) => string | [string, number, number?];

export const replaceSelections = (view: EditorView, func: ReplaceFunction): void => {
	const {state} = view;
	view.dispatch(state.changeByRange(range => {
		const {from, to} = range,
			result = func(state.sliceDoc(from, to), range);
		if (typeof result === 'string') {
			return {
				range: EditorSelection.range(from, from + result.length),
				changes: {from, to, insert: result},
			};
		}
		const [insert, start, end = start] = result;
		return {
			range: EditorSelection.range(start, end),
			changes: {from, to, insert},
		};
	}));
};

/**
 * Get the [wikilint](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#wikilint)
 * extension for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @param lintConfig [Lint configuration](https://github.com/bhsd-harry/wikiparser-node/wiki/Rules#configuration).
 * @param cdn [jsDelivr CDN](https://www.jsdelivr.com/network), defaulting to `https://fastly.jsdelivr.net`
 */
export const wikilint = (configData: ConfigData, lintConfig?: LintConfig, cdn?: string): Extension => {
	updateCDN(cdn);
	const promise = getWikiLintSource(configData, lintConfig);
	return [
		linter(async v => {
			const {state} = v,
				source = await promise,
				diagnostics = (await source(
					v,
				)).map((diagnostic): Diagnostic => ({
					...diagnostic,
					renderMessage(view): HTMLElement {
						const span = elt(
							'span',
							{class: diagnosticSelector.slice(1)},
							this.message,
						);
						span.addEventListener('click', () => {
							view.dispatch({
								selection: {anchor: this.from, head: this.to},
							});
							view.focus();
						});
						return span;
					},
				}));
			if (state.readOnly) {
				for (const diagnostic of diagnostics) {
					delete diagnostic.actions;
				}
			}
			return diagnostics;
		}),
		lintConfig && 'statusBar' in lintConfig && !lintConfig.statusBar ? [] : statusBar(),
	];
};
