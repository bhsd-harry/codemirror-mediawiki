import {StateField, StateEffect} from '@codemirror/state';
import {Decoration, EditorView, WidgetType, ViewPlugin} from '@codemirror/view';
import {getLSP} from '@bhsd/browser';
import elt from 'crelt';
import {base} from './constants.js';
import {
	posToIndex,
	toConfigGetter,
} from './util.js';
import type {DecorationSet, PluginValue, ViewUpdate} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {InlayHint} from 'vscode-languageserver-types';
import type {ConfigData} from 'wikiparser-node';

declare interface InlayHintEffect {
	inlayHints: InlayHint[] | undefined;
	text: string;
}

const cls = 'cm-inlay-hint';

class InlayHintWidget extends WidgetType {
	declare label: string;

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
					const {value: {text, inlayHints}} = effect;
					if (str === text) {
						return inlayHints
							? Decoration.set(
								inlayHints.reverse()
									.map(({position, label}) => [posToIndex(doc, position), label as string] as const)
									.sort(([a], [b]) => a - b)
									.map(
										([index, label]) =>
											Decoration.widget({widget: new InlayHintWidget(label)}).range(index),
									),
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

const updateField = async ({view, docChanged}: Pick<ViewUpdate, 'view' | 'docChanged'>): Promise<void> => {
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
 */
export default (configData: ConfigData): Extension => [
	field,
	ViewPlugin.fromClass(class implements PluginValue {
		constructor(view: EditorView) {
			const timer = setInterval(() => {
				if (getLSP(view, false, toConfigGetter(configData), base.CDN)) {
					clearInterval(timer);
					void updateField({view, docChanged: true});
				}
			}, 100);
		}

		update(update: ViewUpdate): void {
			void updateField(update);
		}
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
