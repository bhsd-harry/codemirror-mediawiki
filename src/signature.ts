import {EditorView, showTooltip} from '@codemirror/view';
import {StateField, StateEffect} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {getLSP} from '@bhsd/browser';
import {base} from './constants.js';
import {tokens} from './config.js';
import {
	createTooltipView,
	indexToPos,
	escHTML,
	toConfigGetter,
	findTemplateName,
} from './util.js';
import type {TooltipView, Tooltip} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {
	SignatureHelp as SignatureHelpBase,
	SignatureInformation,
} from 'vscode-languageserver-types';
import type {CodeMirror6} from './codemirror';

interface SignatureHelp extends Omit<SignatureHelpBase, 'signatures'> {
	signatures: SignatureInformation[] | string[];
}
declare interface SignatureEffect {
	signatureHelp?: SignatureHelp | undefined;
	text: string;
	cursor: number;
}

const stateEffect = StateEffect.define<SignatureEffect>(),
	field = StateField.define<SignatureEffect | undefined>({
		create() {
			return undefined;
		},
		update(oldValue, {state: {doc, selection: {main: {head}}}, effects}) {
			const text = doc.toString();
			for (const effect of effects) {
				if (effect.is(stateEffect)) {
					const {value} = effect;
					if (head === value.cursor && text === value.text) {
						return value;
					}
				}
			}
			return oldValue;
		},
	});

/**
 * @ignore
 * @test
 */
export const getSignatureHelp = ({signatures, activeParameter: active}: SignatureHelp): string =>
	signatures.map(signature => {
		if (typeof signature === 'string') {
			return escHTML(signature);
		}
		const {label, parameters, activeParameter = active} = signature,
			safeLabel = escHTML(label);
		if (activeParameter! < 0 || activeParameter! >= parameters!.length) {
			return safeLabel;
		}
		const colon = safeLabel.indexOf(':'),
			parts = safeLabel.slice(colon + 1, -2).split('|');
		parts[activeParameter!] = `<b>${parts[activeParameter!]}</b>`;
		return `${safeLabel.slice(0, colon)}:${parts.join('|')}}}`;
	}).join('<br>');

export default (
	articlePath?: string,
) => (
	cm: CodeMirror6,
): Extension => {
	return [
		field,
		EditorView.updateListener.of(({view, state, docChanged, selectionSet}) => {
			if (docChanged || selectionSet && state.field(field)?.signatureHelp?.signatures.length) {
				const {doc, selection: {main}} = state,
					{head: cursor} = main,
					text = doc.toString();
				if (!main.empty) {
					view.dispatch({
						effects: stateEffect.of({text, cursor}),
					});
					return;
				}
				(async () => {
					let signatureHelp: SignatureHelp | undefined = await getLSP(
						view,
						false,
						toConfigGetter(
							cm.getWikiConfig,
							articlePath,
						),
						base.CDN,
					)?.provideSignatureHelp(text, indexToPos(doc, cursor));
					if (!signatureHelp && typeof cm.langConfig?.templateSignature === 'function') {
						const tree = syntaxTree(state),
							node = tree.resolve(cursor, 1);
						if (node.name.split('_').includes(tokens.template)) {
							const [templateName, parameterName] = findTemplateName(state, node),
								tooltip = cm.langConfig.templateSignature(templateName, parameterName);
							if (tooltip) {
								signatureHelp = {signatures: [tooltip]};
							}
						}
					}
					view.dispatch({
						effects: stateEffect.of({text, cursor, signatureHelp}),
					});
				})();
			}
		}),
		EditorView.domEventHandlers({
			keydown({key}, view) {
				if (key === 'Escape') {
					const {doc, selection: {main: {head}}} = view.state;
					view.dispatch({
						effects: stateEffect.of({text: doc.toString(), cursor: head}),
					});
				}
			},
		}),
		showTooltip.from(field, (value): Tooltip | null => {
			if (!value) {
				return null;
			}
			const {cursor, signatureHelp} = value;
			return signatureHelp && signatureHelp.signatures.length > 0
				? {
					pos: cursor,
					above: true,
					create(view): TooltipView {
						return createTooltipView(view, getSignatureHelp(signatureHelp));
					},
				}
				: null;
		}),
	];
};
