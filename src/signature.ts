import {syntaxTree} from '@codemirror/language';
import {getLSP} from '@bhsd/browser';
import {getSignatureHelpExtension} from '@bhsd/cm-util/cm';
import {baseData, hoverSelector} from './constants.js';
import {hoverStyle} from './hover.js';
import {
	indexToPos,
	escHTML,
	toConfigGetter,
	findTemplateName,
	isTemplateParam,
} from './util.js';
import type {Extension} from '@codemirror/state';
import type {
	SignatureHelp as SignatureHelpBase,
	SignatureInformation,
} from 'vscode-languageserver-types';
import type {CodeMirror6} from './codemirror';

declare interface SignatureHelp extends Omit<SignatureHelpBase, 'signatures'> {
	signatures: SignatureInformation[] | string[];
}

/**
 * @ignore
 * @test
 */
export const getSignatureHelp = ({signatures, activeParameter: active}: SignatureHelp): string =>
	signatures.map(signature => {
		if (typeof signature === 'string') {
			const safeLabel = escHTML(signature),
				pipe = safeLabel.indexOf('|'),
				equal = safeLabel.indexOf('=', pipe);
			return `${safeLabel.slice(0, pipe)}|<b>${
				safeLabel.slice(pipe + 1, equal)
			}</b>${safeLabel.slice(equal)}`;
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
): Extension => [
	getSignatureHelpExtension<SignatureHelp>({
		className: hoverSelector.slice(1),
		render: getSignatureHelp,
		async update(view, state, {text, cursor}) {
			cm.lsp ??= getLSP(
				view,
				false,
				{
					getConfig: toConfigGetter(
						cm.getWikiConfig,
						articlePath,
					),
					cdn: baseData.CDN,
				},
			);
			const {lsp} = cm;
			let signatureHelp: SignatureHelp | undefined = await lsp?.provideSignatureHelp(
				text,
				indexToPos(state.doc, cursor),
			);
			if (!signatureHelp && typeof cm.langConfig?.templateSignature === 'function') {
				const tree = syntaxTree(state);
				let node = tree.resolve(cursor, -1);
				if (node.to === cursor && !isTemplateParam(node)) {
					node = tree.resolve(cursor, 1);
				}
				if (isTemplateParam(node)) {
					const [templateName, parameterName] = findTemplateName(state, node),
						tooltip = cm.langConfig.templateSignature(templateName, parameterName);
					if (tooltip) {
						signatureHelp = {signatures: [tooltip]};
					}
				}
			}
			return signatureHelp;
		},
	}),
	hoverStyle,
];
