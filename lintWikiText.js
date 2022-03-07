( function ( CodeMirror ) {
	'use strict';
	function clearMarks( cm ) {
		const marks = cm.state.lintWikiText.marks;
		marks.forEach( function ( mark ) {
			mark.clear();
		} );
		marks.length = 0;
	}

	function onChange( cm ) {
		const state = cm.state.lintWikiText;
		if ( !state ) {
			return;
		}
		clearTimeout( state.timeout );
		state.timeout = setTimeout( function () {
			startLinting( cm );
		}, 500 );
	}

	function startLinting( cm ) {
		const state = cm.state.lintWikiText;
		if ( !state ) {
			return;
		}
		clearMarks( cm );
		for ( let i = cm.firstLine(); i <= cm.lastLine(); i++ ) {
			cm.getLineTokens( i ).filter( function ( token ) {
				return /\berror\b/.test( token.type );
			} ).forEach( function ( token ) {
				state.marks.push( cm.markText( { line: i, ch: token.start }, { line: i, ch: token.end }, {
					attributes: { title: token.state.errors[ 0 ] }
				} ) );
			} );
		}
	}

	CodeMirror.defineOption( 'lintWikiText', false, function ( cm, val, old ) {
		if ( old && old !== CodeMirror.Init ) {
			clearMarks( cm );
			cm.off( 'change', onChange );
			clearTimeout( cm.state.lintWikiText.timeout );
			delete cm.state.lintWikiText;
		}

		if ( val ) {
			cm.state.lintWikiText = { marks: [] };
			cm.on( 'change', onChange );
			startLinting( cm );
		}
	} );
}( CodeMirror ) );
