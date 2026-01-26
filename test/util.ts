import * as assert from 'assert';
import {EditorState, EditorSelection, ChangeSet} from '@codemirror/state';
import {CompletionContext} from '@codemirror/autocomplete';
import * as config from 'wikiparser-node/config/default.json';
import {mediawikiBase} from '../src/mediawiki';
import {tagModes, getStaticMwConfig} from '../src/static';
import {linkSuggest, paramSuggest} from '../src/suggest.test';
import type {CompletionResult, CompletionSource} from '@codemirror/autocomplete';
import type {Extension, Transaction, TransactionSpec, RangeSet, StateEffect} from '@codemirror/state';
import type {EditorView, BlockInfo} from '@codemirror/view';
import type {LanguageSupport} from '@codemirror/language';
import type {ConfigData} from 'wikiparser-node';
import type {MwConfig} from '../src/token';
import type {DocRange} from '../src/fold';

export const mwConfig: MwConfig = {
	...getStaticMwConfig(config as unknown as ConfigData, tagModes),
	linkSuggest,
	paramSuggest,
};

export const createState = (doc: string, lang: Extension = mediawikiBase(mwConfig)): EditorState => EditorState.create({
	doc,
	extensions: [lang],
});

export const getEditorSelection = (selection: (number | [number, number])[]): EditorSelection =>
	EditorSelection.fromJSON({
		main: 0,
		ranges: selection.map(pos => {
			const [anchor, head] = posToRange(pos);
			return {anchor, head};
		}),
	});

export const createDispatchableView = (
	text: string,
	ranges: (number | [number, number])[],
	transaction: {
		changes?: (number | [number, ...string[]])[] | {from: number, to: number, insert: string};
		selection?: (number | [number, number])[];
		effects?: [number, number][];
	},
	lang: Extension = mediawikiBase(mwConfig),
): EditorView & {dispatched: Promise<void>} => {
	const state = createState(text, lang),
		{doc} = state;
	Object.assign(state, {selection: getEditorSelection(ranges)});
	const {promise, resolve, reject} = Promise.withResolvers(); // eslint-disable-line es-x/no-promise-withresolvers
	return {
		state,
		dom: {
			querySelector() {
				return null;
			},
		} as Partial<HTMLElement>,
		viewportLineBlocks: Array.from({length: doc.lines}, (_, i) => doc.line(i + 1) as Partial<BlockInfo>),
		lineBlockAt(pos: number) {
			return doc.lineAt(pos) as Partial<BlockInfo>;
		},
		dispatch({changes, selection, effects}: Transaction | TransactionSpec) {
			try {
				if (changes) {
					assert.deepStrictEqual(
						changes instanceof ChangeSet ? changes.toJSON() : changes,
						transaction.changes,
					);
				}
				if (selection) {
					assert.deepStrictEqual(
						selection instanceof EditorSelection
							? selection
							: EditorSelection.single(selection.anchor, selection.head ?? selection.anchor),
						getEditorSelection(transaction.selection!),
					);
				}
				if (effects) {
					if (!Array.isArray(effects)) {
						effects = [effects as StateEffect<unknown>];
					}
					assert.deepStrictEqual(
						(effects as StateEffect<DocRange>[]).map(({value}) => value),
						transaction.effects?.map(([from, to]) => ({from, to})) ?? [],
					);
				}
				resolve(undefined);
			} catch (e) {
				reject(e);
			}
		},
		dispatched: promise,
	} as EditorView & {dispatched: Promise<void>};
};

export const autocompletionTest = (source: CompletionSource, lang?: LanguageSupport, validFor?: RegExp) =>
	async (doc: string, result: CompletionResult | null): Promise<void> => {
		const state = createState(doc, lang),
			context = new CompletionContext(state, doc.length, true),
			completion = await source(context);
		assert.deepStrictEqual(
			completion && {
				...completion,
				options: completion.options.filter(
					option => option.label.toLowerCase().startsWith(doc.slice(completion.from).toLowerCase()),
				).map(option => {
					if (typeof option.apply === 'function') {
						delete option.apply;
					}
					return option;
				}),
			},
			validFor ? result && {...result, validFor} : result,
		);
	};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const convertRangeSet = (set: RangeSet<any>, length: number): [number, number][] => {
	const chunks: [number, number][] = [];
	set.between(0, length, (from, to) => {
		chunks.push([from, to]);
	});
	return chunks;
};

export const posToRange = (pos: number | [number, number]): [number, number] =>
	typeof pos === 'number' ? [pos, pos] : pos;
