import { EditorState, Extension } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';

/**
 * @class CodeMirror
 */
export default class CodeMirror {
	/**
	 * @constructor
	 * @param {HTMLTextAreaElement} textarea Textarea to add syntax highlighting to.
	 */
	constructor( textarea ) {
		this.textarea = textarea;
		this.view = null;
		this.state = null;

		/**
		 * Extensions here should be applicable to all theoretical uses of CodeMirror in MediaWiki.
		 * Don't assume CodeMirror is used for editing (i.e. "View source" of a protected page).
		 * Subclasses are safe to override this method if needed.
		 *
		 * @see https://codemirror.net/docs/ref/#state.Extension
		 * @type {Extension[]}
		 */
		this.defaultExtensions = [
			lineNumbers()
		];
	}

	/**
	 * This specifies which attributes get added to the .cm-content element.
	 * If you need to add more, add another Extension on initialization for the contentAttributes
	 * Facet in the form of EditorView.contentAttributes.of( {Object} ).
	 * Subclasses are safe to override this method, but attributes here are considered vital.
	 *
	 * @see https://codemirror.net/docs/ref/#view.EditorView^contentAttributes
	 * @return {Extension}
	 */
	get contentAttributesExtension() {
		return EditorView.contentAttributes.of( {
			// T259347: Use accesskey of the original textbox
			accesskey: this.textarea.accesskey,
			// use direction and language of the original textbox
			dir: this.textarea.dir,
			lang: this.textarea.lang
		} );
	}

	/**
	 * Setup CodeMirror and add it to the DOM. This will hide the original textarea.
	 *
	 * @param {Extension[]} extensions
	 * @stable
	 */
	initialize( extensions = this.defaultExtensions ) {
		// Set up the initial EditorState of CodeMirror with contents of the native textarea.
		this.state = EditorState.create( {
			doc: this.textarea.value,
			extensions
		} );

		// Add CodeMirror view to the DOM.
		this.view = new EditorView( {
			state: this.state,
			parent: this.textarea.parentElement
		} );

		// Hide native textarea and sync CodeMirror contents upon submission.
		this.textarea.style.display = 'none';
		if ( this.textarea.form ) {
			this.textarea.form.addEventListener( 'submit', () => {
				this.textarea.value = this.view.state.doc.toString();
			} );
		}
	}
}
