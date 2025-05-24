import {EditorView, showTooltip} from '@codemirror/view';
import {StateField, StateEffect} from '@codemirror/state';
import {getLSP} from '@bhsd/common';
import {indexToPos, createTooltipView} from './hover';
import type {TooltipView, Tooltip} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {SignatureHelp} from 'vscode-languageserver-types';
import type {CodeMirror6} from './codemirror';

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

export default (cm: CodeMirror6): Extension => [
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
				view.dispatch({
					effects: stateEffect.of({
						text,
						cursor,
						signatureHelp: await getLSP(view, false, cm.getWikiConfig)
							?.provideSignatureHelp(text, indexToPos(doc, cursor)),
					}),
				});
			})();
		}
	}),
	showTooltip.from(field, (value): Tooltip | null => {
		if (!value) {
			return null;
		}
		const {cursor, signatureHelp} = value;
		if (!signatureHelp || signatureHelp.signatures.length === 0) {
			return null;
		}
		const {signatures, activeParameter: active} = signatureHelp;
		return {
			pos: cursor,
			above: true,
			create(view): TooltipView {
				return createTooltipView(
					view,
					signatures.map(({label, parameters, activeParameter = active}) => {
						if (activeParameter! < 0 || activeParameter! >= parameters!.length) {
							return label;
						}
						const colon = label.indexOf(':'),
							parts = label.slice(colon + 1, -2).split('|');
						parts[activeParameter!] = `<b>${parts[activeParameter!]}</b>`;
						return `${label.slice(0, colon)}:${parts.join('|')}}}`;
					}).join('<br>'),
				);
			},
		};
	}),
] as Extension;
