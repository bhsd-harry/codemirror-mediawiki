import {EditorView, showTooltip} from '@codemirror/view';
import {StateField, StateEffect} from '@codemirror/state';
import {getLSP} from '@bhsd/browser';
import {base} from './constants.js';
import {
	createTooltipView,
	indexToPos,
	escHTML,
	toConfigGetter,
} from './util.js';
import type {TooltipView, Tooltip} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {SignatureHelp} from 'vscode-languageserver-types';
import type {ConfigData} from 'wikiparser-node';

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
 * Get the [signatureHelp](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#signaturehelp)
 * extension for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 */
export default (configData: ConfigData): Extension => [
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
						signatureHelp: await getLSP(view, false, toConfigGetter(configData), base.CDN)
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
						const safeLabel = escHTML(label);
						if (activeParameter! < 0 || activeParameter! >= parameters!.length) {
							return safeLabel;
						}
						const colon = safeLabel.indexOf(':'),
							parts = safeLabel.slice(colon + 1, -2).split('|');
						parts[activeParameter!] = `<b>${parts[activeParameter!]}</b>`;
						return `${safeLabel.slice(0, colon)}:${parts.join('|')}}}`;
					}).join('<br>'),
				);
			},
		};
	}),
] as Extension;
