import { Compartment } from '@codemirror/state';
import { EditorView, lineNumbers, keymap, highlightSpecialChars, highlightActiveLine } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, StreamLanguage } from '@codemirror/language';
import { javascript } from '@codemirror/legacy-modes/mode/javascript';
import { css } from '@codemirror/legacy-modes/mode/css';
import { mediawiki, html } from './mediawiki';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { linter, lintGutter, lintKeymap } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import type { LanguageSupport } from '@codemirror/language';
import type { LintSource } from '@codemirror/lint';
import type { Highlighter } from '@lezer/highlight';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const languages: Record<string, ( config?: any ) => LanguageSupport | StreamLanguage<unknown>> = {
	javascript: () => StreamLanguage.define( javascript ),
	css: () => StreamLanguage.define( css ),
	mediawiki,
	html
};
const linters: Record<string, Extension> = {};

export class CodeMirror6 {
	declare textarea: HTMLTextAreaElement;
	declare language: Compartment;
	declare linter: Compartment;
	declare lintGutter: Compartment;
	declare view: EditorView;

	constructor( textarea: HTMLTextAreaElement, lang: string, config?: unknown ) {
		this.textarea = textarea;
		this.language = new Compartment();
		this.linter = new Compartment();
		this.lintGutter = new Compartment();
		const extensions = [
			this.language.of( languages[ lang ]!( config ) ),
			this.linter.of( [] ),
			this.lintGutter.of( [] ),
			syntaxHighlighting( defaultHighlightStyle as Highlighter ),
			EditorView.contentAttributes.of( {
				accesskey: textarea.accessKey,
				dir: textarea.dir,
				lang: textarea.lang
			} ),
			lineNumbers(),
			EditorView.lineWrapping,
			highlightSpecialChars(),
			highlightActiveLine(),
			indentOnInput(),
			keymap.of( [
				...defaultKeymap,
				...historyKeymap,
				...searchKeymap,
				...lintKeymap
			] )
		];
		this.view = new EditorView( {
			extensions,
			doc: textarea.value,
			parent: textarea.parentElement!
		} );
		this.view.dom.style.height = `${ textarea.offsetHeight }px`;
		this.view.requestMeasure();
		textarea.style.display = 'none';
		if ( textarea.form ) {
			textarea.form.addEventListener( 'submit', () => {
				this.save();
			} );
		}
	}

	setLanguage( lang: string, config?: unknown ): void {
		this.view.dispatch( {
			effects: [
				this.language.reconfigure( languages[ lang ]!( config ) ),
				this.linter.reconfigure( lang in linters ? linters[ lang ]! : [] ),
				this.lintGutter.reconfigure( lang in linters ? lintGutter() : [] )
			]
		} );
	}

	lint( lintSource?: LintSource ): void {
		const lang = ( this.language.get( this.view.state ) as LanguageSupport ).language.name,
			linterExtension = lintSource ? linter( lintSource ) : [];
		if ( lintSource ) {
			linters[ lang ] = linterExtension;
		} else {
			delete linters[ lang ];
		}
		this.view.dispatch( {
			effects: [
				this.linter.reconfigure( linterExtension ),
				this.lintGutter.reconfigure( lintSource ? lintGutter() : [] )
			]
		} );
	}

	save(): void {
		this.textarea.value = this.view.state.doc.toString();
	}
}
