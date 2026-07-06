import {EditorView, showTooltip} from '@codemirror/view';
import {StateField, StateEffect} from '@codemirror/state';
import {getLSP} from '@bhsd/browser';
import {createTooltipView} from '@bhsd/cm-util';
import {baseData, hoverSelector} from './constants.js';
import {hoverStyle} from './hover.js';
import {
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
		provide(f) {
			return showTooltip.from(f, (value): Tooltip | null => {
				if (!value) {
					return null;
				}
				const {cursor, signatureHelp} = value;
				return signatureHelp?.signatures.length
					? {
						pos: cursor,
						above: true,
						create(view): TooltipView {
							return createTooltipView(view, getSignatureHelp(signatureHelp), hoverSelector.slice(1));
						},
					}
					: null;
			});
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

const dispatchSignatureEffect = (view: EditorView, effect: SignatureEffect): void => {
	view.dispatch({
		effects: signatureEffect.of(effect),
	});
};

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
					dispatchSignatureEffect(view, {text, cursor});
					return;
				}
				(async () => {
					const lsp = getLSP(
						view,
						true,
						{
							getConfig: toConfigGetter(
								configData,
							),
							cdn: baseData.CDN,
						},
					);
					// eslint-disable-next-line prefer-const
					let signatureHelp: SignatureHelp | undefined = await lsp?.provideSignatureHelp(
						text,
						indexToPos(doc, cursor),
					);
					dispatchSignatureEffect(view, {text, cursor, signatureHelp});
				})();
			}
		}),
		EditorView.domEventHandlers({
			keydown({key}, view) {
				if (key === 'Escape') {
					const {doc, selection: {main: {head}}} = view.state;
					dispatchSignatureEffect(view, {text: doc.toString(), cursor: head});
				}
			},
		}),
		hoverStyle,
	];
};
