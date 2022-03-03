( function ( CodeMirror ) {
	/* eslint-disable no-unused-vars */
	'use strict';

	const permittedHtmlTags = {
			b: true, bdi: true, del: true, i: true, ins: true, img: true,
			u: true, font: true, big: true, small: true, sub: true, sup: true,
			h1: true, h2: true, h3: true, h4: true, h5: true, h6: true, cite: true,
			code: true, em: true, s: true, strike: true, strong: true, tt: true,
			var: true, div: true, center: true, blockquote: true, q: true, ol: true, ul: true,
			dl: true, table: true, caption: true, pre: true, ruby: true, rb: true,
			rp: true, rt: true, rtc: true, p: true, span: true, abbr: true, dfn: true,
			kbd: true, samp: true, data: true, time: true, mark: true, br: true,
			wbr: true, hr: true, li: true, dt: true, dd: true, td: true, th: true,
			tr: true, noinclude: true, includeonly: true, onlyinclude: true, translate: true
		},
		voidHtmlTags = { br: true, hr: true, wbr: true, img: true },
		span = document.createElement( 'span' ), // used for isEntity()
		nsFileRegex = getFileRegex();
	var mwConfig, urlProtocols;

	function getFileRegex() {
		const nsIds = mw.config.get( 'wgNamespaceIds' ),
			nsFile = Object.keys( nsIds ).filter( function ( ns ) {
				return nsIds[ ns ] === 6;
			} ).join( '|' );
		return new RegExp( '^(?:' + nsFile + ')[\\s\\xa0]*:[\\s\\xa0]*', 'i' );
	}

	/**
	 * @typedef Apos
	 * @type {object}
	 * @property {boolean} bold - apostrophe '''
	 * @property {boolean} italic - apostrophe ''
	 * @property {boolean} dt - list containing ';'
	 * @property {boolean} th - table cell starting with '!' at SOL
	 */

	/**
	 * @typedef state
	 * @type {object}
	 * @property {function} tokenize - next token
	 * @property {Array.<function>} stack - ancestor tokens
	 * @property {Array.<string>} InHtmlTag - ancestor HTML tags
	 * @property {Apos} apos - apostrophe states
	 * @property {Apos} parentApos - parent apostrophe states
	 * @property {Array.<Apos>} aposStack - ancestor apostrophe states
	 * @property {number} nTemplate - ancestor templates
	 * @property {number} nLink - ancestor links
	 * @property {number} nExt - ancestor parser functions
	 * @property {number} nInvisible - ancestor invisible syntax
	 * - parser function name
	 * - template pagename
	 * - template variable name
	 * - internal link pagename if there is link text
	 * - external link
	 * - tag
	 * - table definition
	 */

	/**
	 * add background
	 * For invisible content
	 * @param {string} style - base style
	 * @param {?string} endGround - key for decrement
	 * @returns {?string} style
	 */
	function makeLocalStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		}
		var ground = '';
		switch ( state.nTemplate ) {
			case 0:
				break;
			case 1:
				ground += '-template';
				break;
			case 2:
				ground += '-template2';
				break;
			default:
				ground += '-template3';
		}
		switch ( state.nExt ) {
			case 0:
				break;
			case 1:
				ground += '-ext';
				break;
			case 2:
				ground += '-ext2';
				break;
			default:
				ground += '-ext3';
		}
		switch ( state.nLink ) {
			case 0:
				break;
			case 1:
				ground += '-link';
				break;
			default:
				ground += '-link2';
		}
		if ( endGround ) {
			state[ endGround ]--;
		}
		return style + ( ground && ' mw' + ground + '-ground' );
	}

	/**
	 * show apostrophe-related styles in addition to background
	 * For parser function and template arguments (half-invisible)
	 * @returns {?string} style
	 */
	function makeStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		} else if ( state.nInvisible ) {
			return makeLocalStyle( style, state, endGround );
		}
		const strong = state.apos.bold ? ' strong' : '',
			em = state.apos.italic ? ' em' : '';
		return makeLocalStyle( style + strong + em, state, endGround );
	}

	/**
	 * show HTML-related styles in addition to apostrophes
	 * For usual content
	 * @returns {?string} style
	 */
	function makeFullStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		} else if ( state.nInvisible ) {
			return makeLocalStyle( style, state, endGround );
		}
		const tags = state.InHtmlTag.join(),
			strong = state.apos.bold || state.apos.dt || state.apos.th || /\b(?:b|strong)\b/.test( tags ) ? ' strong' : '',
			em = state.apos.italic || /\b(?:i|em)\b/.test( tags ) ? ' em' : '',
			strikethrough = /\b(?:strike|s|del)\b/.test( tags ) ? ' strikethrough' : '';
		return makeLocalStyle( style + strong + em, state, endGround );
	}

	/**
	 * show bold/italic font based on both local and parent apostrophe states
	 * For internal link text, including file link caption
	 * @returns {?string} style
	 */
	function makeOrStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		}
		const orState = $.extend( {}, state, { apos: {
			bold: state.apos.bold || state.parentApos.bold,
			italic: state.apos.italic || state.parentApos.italic
		} } );
		return makeFullStyle( style, orState, endGround );
	}

	/**
	 * recursively call a token, which must includes an exit statement
	 * @example
	 * state.tokenize = state.stack.pop();
	 * @param {function} parser - token
	 * @returns {function} input token
	 */
	function chain( parser ) {
		return function ( stream, state ) {
			state.stack.push( state.tokenize );
			state.tokenize = parser;
			return parser( stream, state );
		};
	}

	/**
	 * greedy eat white spaces without returned styles
	 * @returns {(Array.<string>|false)} result of RegExp match or false
	 */
	function eatSpace( stream ) {
		return stream.match( /^[\s\xa0]+/ );
	}

	/**
	 * eat until a specified terminator or EOL
	 * Not chained by default; exit only at terminator
	 * @param {?string} terminator - terminator string
	 */
	function eatBlock( makeFunc, style, terminator ) {
		return function ( stream, state ) {
			if ( !terminator ) {
				stream.skipToEnd();
				state.tokenize = state.stack.pop();
			} else if ( stream.skipTo( terminator ) ) {
				stream.match( terminator );
				state.tokenize = state.stack.pop();
			} else {
				stream.skipToEnd();
			}
			return makeFunc( style, state );
		};
	}

	/**
	 * eat a specific number of characters
	 * @param {number} chars - number of characters to eat
	 */
	function eatChars( chars, makeFunc, style ) {
		return function ( stream, state ) {
			state.tokenize = state.stack.pop();
			for ( var i = 0; i < chars; i++ ) {
				stream.next();
			}
			return makeFunc( style, state );
		};
	}

	/**
	 * reset all apostrophe states
	 */
	function clearApos( state ) {
		state.aposStack = state.aposStack.map( function () {
			return {};
		} );
		state.apos = {};
	}

	/**
	 * special characters that can start wikitext syntax:
	 * line start : - = # * : ; SPACE {
	 * other      : { & ' ~ _ [ <
	 * details    :
	 * ----       : <hr> (line start)
	 * =          : <h1> ~ <h6> (line start)
	 * #          : <ol> (line start)
	 * *          : <ul> (line start)
	 * ;          : <dt> (line start)
	 * :          : <dd> (line start)
	 * SPACE      : <pre> (line start)
	 * {|         : <table> (line start)
	 * {{         : parser functions and templates
	 * {{{        : variables
	 * &          : HTML entities
	 * ''         : <i> <b>
	 * ~~~        : signature
	 * __         : behavior switch
	 * [          : external link
	 * [[         : internal link
	 * <          : tags
	 */

	/**
	 * illegal characters in page name
	 * # < > [ ] { } |
	 */

	/**
	 * additional illegal characters in file name
	 * / : &
	 */

	/**
	 * token template (order not restricted)
	 * 1. SOL/EOL
	 * 2. plain text
	 * 3. unique syntax
	 * 4. valid wikitext
	 * 5. fallback
	 */

	/**
	 * free external link protocol
	 * Always used as fallback
	 * @param {string} restriction - escaped special characters for syntax
	 */
	function eatFreeExternalLinkProtocol( makeFunc, style, restriction ) {
		return function ( stream, state ) {
			stream.next();
			return makeFunc( style, state );
		};
	}

	/**
	 * common wikitext syntax at SOL
	 * Always advances
	 * @param {?string} style - fallback style
	 * @returns {?string}
	 */
	function eatWikiTextSol( makeFunc, style ) {
		return function ( stream, state ) {
			const ch = stream.next();
			switch ( ch ) {
				case '-': // 3. valid wikitext: ----
					if ( stream.match( /^-{3,}/ ) ) {
						return 'mw-hr'; // has own background
					}
					break;
				case '*': // 3. valid wikitext: *, #, ;
				case '#':
				case ';': {
					const mt = stream.match( /^[*#;:]*/ );
					if ( ch === ';' || /;/.test( mt[ 0 ] ) ) {
						state.apos.dt = true;
					}
					return makeLocalStyle( 'mw-list', state );
				}
				case ':': {
					const mt = stream.match( /^[*#;:]*/ );
					if ( /;/.test( mt[ 0 ] ) ) {
						state.apos.dt = true;
					}
					return makeLocalStyle( 'mw-list', state );
				}
				case ' ': {
					return 'mw-skipformatting'; // has own background
				}
			}
			return makeFunc( style, state ); // 5. fallback
		};
	}

	/**
	 * other common wikitext syntax
	 * Always advances
	 * @param {?string} style - default fallback style
	 * @param {?Object.<string, string>} details - individual fallback styles for different characters
	 * @property amp - '&'
	 * @property tilde - '~'
	 * @property apos - "'"
	 * @property lowbar - '_'
	 * @property lbrack - '['
	 * @property lbrace - '{'
	 * @property lt - '<'
	 * @returns {?string}
	 */
	function eatWikiTextOther( makeFunc, style, details ) {
		return function ( stream, state ) {
			const errorStyle = details === undefined ? style : details;
			stream.next();
			return makeFunc( errorStyle, state );
		};
	}

	/**
	 * eat general wikitext
	 * 1. eatWikiTextSol() at SOL
	 * 2. eatWikiTextOther()
	 * 3. eat free external link
	 * @param {string} style - fallback style
	 */
	function eatWikiText( style ) {
		return function ( stream, state ) {
			var result;

			if ( stream.sol() ) { // 1. SOL
				clearApos( state );
				result = eatWikiTextSol( makeStyle )( stream, state );
				if ( result !== undefined ) {
					return result;
				}
				stream.backUp( 1 );
			}

			result = eatWikiTextOther( makeStyle )( stream, state ); // 4. common wikitext
			if ( result !== undefined ) {
				return result;
			}
			stream.backUp( 1 );

			return eatFreeExternalLinkProtocol( makeFullStyle, style, '' )( stream, state ); // 5. fallback
		};
	}

	CodeMirror.defineMode( 'mediawiki', function ( config /* , parserConfig */ ) {
		mwConfig = config.mwConfig;
		urlProtocols = new RegExp( '^(?:' + mwConfig.urlProtocols + ')', 'i' );

		return {
			startState: function () {
				return {
					tokenize: eatWikiText( '' ),
					stack: [], InHtmlTag: [],
					apos: {}, parentApos: {}, aposStack: [],
					extName: false, extMode: false, extState: false,
					nTemplate: 0, nLink: 0, nExt: 0, nInvisible: 0
				};
			},
			copyState: function ( state ) {
				return {
					tokenize: state.tokenize,
					stack: state.stack.concat( [] ),
					InHtmlTag: state.InHtmlTag.concat( [] ),
					apos: state.apos,
					parentApos: state.parentApos,
					aposStack: state.aposStack.concat( [] ),
					extName: state.extName,
					extMode: state.extMode,
					extState: state.extMode !== false && CodeMirror.copyState( state.extMode, state.extState ),
					nTemplate: state.nTemplate,
					nLink: state.nLink,
					nExt: state.nExt,
					nInvisible: state.nInvisible
				};
			},
			token: function ( stream, state ) {
				return state.tokenize( stream, state );
			},
			blankLine: function ( state ) {
				if ( state.extName ) {
					if ( state.extMode ) {
						var ret = '';
						if ( state.extMode.blankLine ) {
							ret = ' ' + state.extMode.blankLine( state.extState );
						}
						return 'line-cm-mw-tag-' + state.extName + ret;
					}
					return 'line-cm-mw-exttag';
				}
			}
		};
	} );

	CodeMirror.defineMIME( 'text/mediawiki', 'mediawiki' );
}( CodeMirror ) );
