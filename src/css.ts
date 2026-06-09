import {cssLanguage, cssCompletionSource} from '@codemirror/lang-css';
import {LanguageSupport, syntaxTree} from '@codemirror/language';
import {sliceDoc, getCompletions} from './util.js';
import type {Extension} from '@codemirror/state';
import type {CompletionSource, CompletionResult} from '@codemirror/autocomplete';
import type {Dialect} from './codemirror';

const cssWideKeywords = /* #__PURE__ */ getCompletions(['revert', 'revert-layer']);

/**
 * CSS completion source with dialect-specific adjustments.
 * @param dialect 是否是sanitized-css
 * @test
 */
export const cssCompletion = (dialect?: Dialect): Extension => {
	const source: CompletionSource = context => {
		const {state, pos} = context,
			node = syntaxTree(state).resolveInner(pos, -1),
			result = cssCompletionSource(context) as CompletionResult | null;
		if (result) {
			if (node.name === 'ValueName') {
				const options = [...cssWideKeywords, ...result.options];
				let {prevSibling} = node;
				while (prevSibling && prevSibling.name !== 'PropertyName') {
					({prevSibling} = prevSibling);
				}
				if (prevSibling) {
					for (let i = 0; i < options.length; i++) {
						const option = options[i]!;
						if (CSS.supports(sliceDoc(state, prevSibling), option.label)) {
							options[i] = {...option, boost: 50};
						}
					}
				}
				result.options = options;
			} else if (dialect === 'sanitized-css') {
				result.options = result.options.filter(
					({type, label}) => type !== 'property'
						|| !label.startsWith('-') || label.endsWith('-user-select'),
				);
			}
		}
		return result;
	};
	return cssLanguage.data.of({autocomplete: source});
};

export default (dialect: Dialect): LanguageSupport => new LanguageSupport(cssLanguage, cssCompletion(dialect));
