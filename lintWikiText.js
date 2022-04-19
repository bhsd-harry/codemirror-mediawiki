( () => {
	'use strict';
	const { Pos } = CodeMirror;

	const clearMarks = ( cm ) => {
		const { marks } = cm.state.lintWikiText;
		marks.forEach( mark => {
			mark.clear();
		} );
		marks.length = 0;
	};

	const startLinting = ( cm, from, to ) => {
		const state = cm.state.lintWikiText;
		if ( !state ) {
			return;
		}
		clearMarks( cm );
		for ( let i = from; i < to; i++ ) {
			cm.getLineTokens( i ).filter( token => /\berror\b/.test( token.type || '' ) ).forEach( token => {
				const mark = cm.markText( Pos( i, token.start ), Pos( i, token.end ), {
					attributes: { title: token.state.errors[ 0 ] },
				} );
				state.marks.push( mark );
			} );
		}
	};

	const onChange = ( cm, from, to ) => {
		const state = cm.state.lintWikiText;
		if ( !state ) {
			return;
		}
		clearTimeout( state.timeout );
		state.timeout = setTimeout( () => {
			if ( from === undefined || to === undefined ) {
				( { from, to } = cm.getViewport() ); // eslint-disable-line no-param-reassign
			}
			startLinting( cm, from, to );
		}, 500 );
	};

	CodeMirror.defineOption( 'lintWikiText', false, ( cm, val, old ) => {
		if ( old && old !== CodeMirror.Init ) {
			clearMarks( cm );
			cm.off( 'change', onChange );
			cm.off( 'viewportChange', onChange );
			clearTimeout( cm.state.lintWikiText.timeout );
			delete cm.state.lintWikiText;
		}

		if ( val ) {
			cm.state.lintWikiText = { marks: [] };
			cm.on( 'change', onChange );
			cm.on( 'viewportChange', onChange );
			const { from, to } = cm.getViewport();
			startLinting( cm, from, to );
		}
	} );
} )();
