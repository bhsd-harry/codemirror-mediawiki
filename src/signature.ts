import {getLSP, escHTML} from '@bhsd/browser';
import {getSignatureHelpExtension} from '@bhsd/cm-util/cm';
import {baseData, hoverSelector} from './constants.js';
import {hoverStyle} from './hover.js';
import {
	indexToPos,
	toConfigGetter,
	updateCDN,
} from './util.js';
import type {Extension} from '@codemirror/state';
import type {
	SignatureHelp,
} from 'vscode-languageserver-types';
import type {ConfigData} from 'wikiparser-node';

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
		getSignatureHelpExtension<SignatureHelp>({
			className: hoverSelector.slice(1),
			render: getSignatureHelp,
			async update(view, state, {text, cursor}) {
				const lsp =
					getLSP(
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
					indexToPos(state.doc, cursor),
				);
				return signatureHelp;
			},
		}),
		hoverStyle,
	];
};
