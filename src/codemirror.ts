import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { mediaWikiLang } from './mediawiki';
import type { MwConfig } from './mediawiki';

class CodeMirror6 {
	declare textarea: HTMLTextAreaElement;
	declare state: EditorState;
	declare view: EditorView;

	constructor( textarea: HTMLTextAreaElement, config: MwConfig ) {
		const extensions = [
			mediaWikiLang( config ),
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
		this.textarea = textarea;
		this.state = EditorState.create( {
			doc: textarea.value,
			extensions
		} );
		this.view = new EditorView( {
			state: this.state,
			parent: textarea.parentElement!
		} );
		textarea.style.display = 'none';
		if ( textarea.form ) {
			textarea.form.addEventListener( 'submit', () => {
				textarea.value = this.view.state.doc.toString();
			} );
		}
	}
}

Object.assign( self, CodeMirror6 );
