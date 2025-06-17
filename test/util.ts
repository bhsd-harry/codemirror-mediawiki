import * as assert from 'assert';
import {EditorState} from '@codemirror/state';
import {CompletionContext} from '@codemirror/autocomplete';
import * as config from 'wikiparser-node/config/default.json';
import {tagModes, getStaticMwConfig} from '../src/static';
import {mediawiki} from '../src/mediawiki';
import type {CompletionResult, CompletionSource} from '@codemirror/autocomplete';
import type {LanguageSupport} from '@codemirror/language';
import type {ConfigData} from 'wikiparser-node';

export const mwConfig = getStaticMwConfig(config as unknown as ConfigData, tagModes);

export const createState = (doc: string, lang = mediawiki(mwConfig)): EditorState => EditorState.create({
	doc,
	extensions: [lang],
});

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
