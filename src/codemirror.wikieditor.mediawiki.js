import CodeMirrorWikiEditor from './codemirror.wikieditor';
import { mediaWikiLang } from './codemirror.mode.mediawiki';

/**
 * @param {HTMLTextAreaElement} textarea
 */
const codemirrorMediawiki = ( textarea, config ) => {
	const cmWE = new CodeMirrorWikiEditor( textarea, mediaWikiLang( config ) );
	cmWE.enableCodeMirror();
};
Object.assign( self, { codemirrorMediawiki } );
