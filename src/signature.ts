import {EditorView, showTooltip} from '@codemirror/view';
import {StateField, StateEffect} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {getLSP} from '@bhsd/browser';
import {baseData} from './constants.js';
import {hoverStyle} from './hover.js';
import {
	createTooltipView,
	indexToPos,
	escHTML,
	toConfigGetter,
	findTemplateName,
	isTemplateParam,
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
							return createTooltipView(view, getSignatureHelp(signatureHelp));
						},
					}
					: null;
			});
		},
	});

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

const dispatchSignatureEffect = (view: EditorView, effect: SignatureEffect): void => {
	view.dispatch({
		effects: signatureEffect.of(effect),
	});
};

export default (
	articlePath?: string,
) => (
	cm: CodeMirror6,
): Extension => {
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
						indexToPos(doc, cursor),
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
