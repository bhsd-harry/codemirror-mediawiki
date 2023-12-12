import { Compartment } from '@codemirror/state';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { mediawiki } from './mediawiki';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { linter, lintGutter } from '@codemirror/lint';
import type { LanguageSupport } from '@codemirror/language';
import type { LintSource } from '@codemirror/lint';
import type { Highlighter } from '@lezer/highlight';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const languages: Record<string, ( config?: any ) => LanguageSupport> = {
	mediawiki,
	javascript,
	css
};

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
			history(),
			keymap.of( [
				...defaultKeymap,
				...searchKeymap,
				...historyKeymap
			] )
		];
		this.view = new EditorView( {
			extensions,
			doc: textarea.value,
			parent: textarea.parentElement!
		} );
		textarea.style.display = 'none';
		if ( textarea.form ) {
			textarea.form.addEventListener( 'submit', () => {
				textarea.value = this.view.state.doc.toString();
			} );
		}
	}

	setLanguage( lang: string, config?: unknown ): void {
		this.view.dispatch( {
			effects: [
				this.language.reconfigure( languages[ lang ]!( config ) ),
				this.linter.reconfigure( [] )
			]
		} );
	}

	lint( lintSource?: LintSource ): void {
		this.view.dispatch( {
			effects: [
				this.linter.reconfigure( lintSource ? linter( lintSource ) : [] ),
				this.lintGutter.reconfigure( lintSource ? lintGutter() : [] )
			]
		} );
	}
}
