import {StateField, StateEffect} from '@codemirror/state';
import {Decoration, EditorView, WidgetType, ViewPlugin} from '@codemirror/view';
import {getLSP} from '@bhsd/browser';
import elt from 'crelt';
import {baseData} from './constants.js';
import {
	posToIndex,
	toConfigGetter,
	updateCDN,
} from './util.js';
import type {DecorationSet, ViewUpdate} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {InlayHint} from 'vscode-languageserver-types';
import type {ConfigData} from 'wikiparser-node';

declare interface InlayHintEffect {
	inlayHints: InlayHint[] | undefined;
	text: string;
}

const cls = 'cm-inlay-hint';

class InlayHintWidget extends WidgetType {
	declare label;

	constructor(label: string) {
		super();
		this.label = label;
	}

	toDOM(): HTMLElement {
		return elt('span', {class: cls}, this.label);
	}
}

const stateEffect = StateEffect.define<InlayHintEffect>(),
	field = StateField.define<DecorationSet>({
		create() {
			return Decoration.none;
		},
		update(deco, {state: {doc}, effects}) {
			const str = doc.toString();
			for (const effect of effects) {
				if (effect.is(stateEffect)) {
					const {text, inlayHints} = effect.value;
					if (str === text) {
						return inlayHints
							? Decoration.set(
								inlayHints.map(({position, label}) => Decoration.widget({
									widget: new InlayHintWidget(label as string),
								}).range(posToIndex(doc, position))),
								true,
							)
							: Decoration.none;
					}
				}
			}
			return deco;
		},
		provide(f) {
			return EditorView.decorations.from(f);
		},
	});

const update = async ({view, docChanged}: Pick<ViewUpdate, 'view' | 'docChanged'>): Promise<void> => {
	if (docChanged) {
		const text = view.state.doc.toString();
		view.dispatch({
			effects: stateEffect.of({
				text,
				inlayHints: await getLSP(view)?.provideInlayHints(text),
			}),
		});
	}
};

/**
 * Get the [inlayHints](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#inlayhints)
 * extension for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @param cdn [jsDelivr CDN](https://www.jsdelivr.com/network), defaulting to `https://fastly.jsdelivr.net`
 */
export default (
	configData: ConfigData,
	cdn?: string,
): Extension => {
	updateCDN(cdn);
	return [
		field,
		ViewPlugin.define(view => {
			const timer = setInterval(() => {
				if (
					getLSP(
						view,
						true,
						toConfigGetter(
							configData,
						),
						baseData.CDN,
					)
				) {
					clearInterval(timer);
					void update({view, docChanged: true});
				}
			}, 100);
			return {update};
		}),
		EditorView.theme({
			[`.${cls}`]: {
				color: '#969696',
				fontStyle: 'italic',
				'-webkitUserSelect': 'none',
				userSelect: 'none',
			},
		}),
	];
};
