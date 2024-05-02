import {javascript as js, javascriptLanguage, scopeCompletionSource} from '@codemirror/lang-javascript';
import {cssLanguage, cssCompletionSource} from '@codemirror/lang-css';
import {LanguageSupport, syntaxTree} from '@codemirror/language';
import type {Extension} from '@codemirror/state';
import type {CompletionContext, CompletionResult} from '@codemirror/autocomplete';
export {json as jsonLR} from '@codemirror/lang-json';
export {css} from '@codemirror/legacy-modes/mode/css';
export {javascript} from '@codemirror/legacy-modes/mode/javascript';
export {lua} from '@codemirror/legacy-modes/mode/lua';

export const javascriptLR = (): Extension => [
	js(),
	javascriptLanguage.data.of({autocomplete: scopeCompletionSource(window)}),
];

export const cssLR = (): Extension => new LanguageSupport(cssLanguage, cssLanguage.data.of({
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
				for (const [i, option] of options.entries()) {
					if (CSS.supports(`${state.sliceDoc(prevSibling.from, node.from)}${option.label}`)) {
						options.splice(i, 1, {...option, boost: 50});
					}
				}
			}
			result.options = options;
		}
		return result;
	},
}));
