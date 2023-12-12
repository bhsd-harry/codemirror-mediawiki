import CodeMirror from './codemirror';
import { EditorSelection } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { LanguageSupport } from '@codemirror/language';

/**
 * @class CodeMirrorWikiEditor
 */
export default class CodeMirrorWikiEditor extends CodeMirror {
	/**
	 * @param {HTMLTextAreaElement} textarea
	 * @param {LanguageSupport} langExtension
	 */
	constructor( textarea, langExtension ) {
		super( textarea );
		this.langExtension = langExtension;
	}

	/**
	 * Replaces the default textarea with CodeMirror
	 */
	enableCodeMirror() {
		// If CodeMirror is already loaded, abort.
		if ( this.view ) {
			return;
		}

		const { selectionStart, selectionEnd, scrollTop } = this.textarea,
			hasFocus = this.textarea.matches( ':focus' );

		/**
		 * Default configuration, which we may conditionally add to later.
		 * @see https://codemirror.net/docs/ref/#state.Extension
		 */
		const extensions = [
			...this.defaultExtensions,
			this.langExtension,
			history(),
			EditorView.domEventHandlers( {
				blur: () => this.textarea.blur(),
				focus: () => this.textarea.focus()
			} ),
			EditorView.lineWrapping,
			keymap.of( [
				...defaultKeymap,
				...searchKeymap,
				...historyKeymap
			] )
		];

		this.initialize( extensions );

		// Sync scroll position, selections, and focus state.
		this.view.scrollDOM.scrollTop = scrollTop;
		this.view.dispatch( {
			selection: EditorSelection.create( [
				EditorSelection.range( selectionStart, selectionEnd )
			] ),
			scrollIntoView: true
		} );
		if ( hasFocus ) {
			this.view.focus();
		}
	}
}
