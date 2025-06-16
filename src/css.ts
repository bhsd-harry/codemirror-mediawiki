import {cssLanguage, cssCompletionSource} from '@codemirror/lang-css';
import {LanguageSupport, syntaxTree} from '@codemirror/language';
import type {CompletionContext, CompletionResult} from '@codemirror/autocomplete';

export default (): LanguageSupport => new LanguageSupport(cssLanguage, cssLanguage.data.of({
	autocomplete(context: CompletionContext) {
		const {state, pos} = context,
			node = syntaxTree(state).resolveInner(pos, -1),
			result = cssCompletionSource(context) as CompletionResult | null;
		if (result && node.name === 'ValueName') {
			const options = [{label: 'revert', type: 'keyword'}, ...result.options];
			let {prevSibling} = node;
			while (prevSibling && prevSibling.name !== 'PropertyName') {
				({prevSibling} = prevSibling);
			}
			if (prevSibling) {
				for (let i = 0; i < options.length; i++) {
					const option = options[i]!;
					if (CSS.supports(state.sliceDoc(prevSibling.from, node.from) + option.label)) {
						options.splice(i, 1, {...option, boost: 50});
					}
				}
			}
			result.options = options;
		}
		return result;
	},
}));
