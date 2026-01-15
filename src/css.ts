import {cssLanguage, cssCompletionSource} from '@codemirror/lang-css';
import {LanguageSupport, syntaxTree} from '@codemirror/language';
import {sliceDoc} from './util.js';
import type {Extension} from '@codemirror/state';
import type {CompletionContext, CompletionResult, Completion} from '@codemirror/autocomplete';
import type {Dialect} from './codemirror';

const cssWideKeywords = /* @__PURE__ */ (
	() => ['revert', 'revert-layer'].map((label): Completion => ({label, type: 'keyword'}))
)();

export const cssCompletion = (dialect?: Dialect): Extension => cssLanguage.data.of({
	autocomplete(context: CompletionContext) {
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
							options.splice(i, 1, {...option, boost: 50});
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
	},
});

export default (dialect: Dialect): LanguageSupport => new LanguageSupport(cssLanguage, cssCompletion(dialect));
