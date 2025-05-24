import {StateField, StateEffect} from '@codemirror/state';
import {Decoration, EditorView, WidgetType, ViewPlugin} from '@codemirror/view';
import {getLSP} from '@bhsd/common';
import {posToIndex} from './hover';
import type {DecorationSet, PluginValue, ViewUpdate} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {InlayHint} from 'vscode-languageserver-types';
import type {CodeMirror6} from './codemirror';

declare interface InlayHintEffect {
	inlayHints: InlayHint[] | undefined;
	text: string;
}

class InlayHintWidget extends WidgetType {
	declare label: string;

	constructor(label: string) {
		super();
		this.label = label;
	}

	toDOM(): HTMLSpanElement {
		const element = document.createElement('span');
		element.textContent = this.label;
		element.className = 'cm-inlay-hint';
		return element;
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

export default (cm: CodeMirror6): Extension => [
	field,
	ViewPlugin.fromClass(class implements PluginValue {
		constructor(view: EditorView) {
			const timer = setInterval(() => {
				if (getLSP(view, false, cm.getWikiConfig)) {
					clearInterval(timer);
					void updateField({view, docChanged: true});
				}
			}, 100);
		}

		update(update: ViewUpdate): void { // eslint-disable-line @typescript-eslint/class-methods-use-this
			void updateField(update);
		}
	}),
];
