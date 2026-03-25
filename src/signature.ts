import {EditorView, showTooltip} from '@codemirror/view';
import {StateField, StateEffect} from '@codemirror/state';
import {getLSP} from '@bhsd/browser';
import {baseData} from './constants.js';
import {
	createTooltipView,
	indexToPos,
	escHTML,
	toConfigGetter,
	updateCDN,
} from './util.js';
import type {TooltipView, Tooltip} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {
	SignatureHelp,
} from 'vscode-languageserver-types';
import type {ConfigData} from 'wikiparser-node';

declare interface SignatureEffect {
	signatureHelp?: SignatureHelp | undefined;
	text: string;
	cursor: number;
}

const signatureEffect = StateEffect.define<SignatureEffect>(),
	signatureField = StateField.define<SignatureEffect | undefined>({
		create() {
			return undefined;
		},
		update(oldValue, {state: {doc, selection: {main: {head}}}, effects}) {
			const text = doc.toString();
			for (const effect of effects) {
				if (effect.is(signatureEffect)) {
					const {value} = effect;
					if (head === value.cursor && text === value.text) {
						return value;
					}
				}
			}
			return oldValue;
		},
	});

export const getSignatureHelp = ({signatures, activeParameter: active}: SignatureHelp): string =>
	signatures.map(signature => {
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
	configData: ConfigData,
	cdn?: string,
): Extension => {
	updateCDN(cdn);
	return [
		signatureField,
		EditorView.updateListener.of(({view, state, docChanged, selectionSet}) => {
			if (docChanged || selectionSet && state.field(signatureField)?.signatureHelp?.signatures.length) {
				const {doc, selection: {main}} = state,
					{head: cursor} = main,
					text = doc.toString();
				if (!main.empty) {
					view.dispatch({
						effects: signatureEffect.of({text, cursor}),
					});
					return;
				}
				(async () => {
					// eslint-disable-next-line prefer-const
					let signatureHelp: SignatureHelp | undefined = await getLSP(
						view,
						true,
						toConfigGetter(
							configData,
						),
						baseData.CDN,
					)?.provideSignatureHelp(text, indexToPos(doc, cursor));
					view.dispatch({
						effects: signatureEffect.of({text, cursor, signatureHelp}),
					});
				})();
			}
		}),
		EditorView.domEventHandlers({
			keydown({key}, view) {
				if (key === 'Escape') {
					const {doc, selection: {main: {head}}} = view.state;
					view.dispatch({
						effects: signatureEffect.of({text: doc.toString(), cursor: head}),
					});
				}
			},
		}),
		showTooltip.from(signatureField, (value): Tooltip | null => {
			if (!value) {
				return null;
			}
			const {cursor, signatureHelp} = value;
			return signatureHelp?.signatures.length
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
