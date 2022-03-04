( function ( CodeMirror ) {
	/* eslint-disable no-unused-vars, camelcase */
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
		nsFileRegex = getFileRegex();
	var span, mwConfig, urlProtocols, redirectRegex;
	if ( typeof document === 'object' ) {
		span = document.createElement( 'span' ); // used for isEntity()
	}

	function getFileRegex() {
		const nsIds = typeof mw === 'object'
				? mw.config.get( 'wgNamespaceIds' )
				: { file: 6, image: 6, 图像: 6, 圖像: 6, 档案: 6, 檔案: 6, 文件: 6 },
			nsFile = Object.keys( nsIds ).filter( function ( ns ) {
				return nsIds[ ns ] === 6;
			} ).join( '|' );
		return new RegExp( '^(?:' + nsFile + ')[\\s\\xa0]*:[\\s\\xa0]*', 'i' );
	}

	function escapeRegExp( str ) {
		return str.replace( /([\\{}()|.?*+\-^$[\]])/g, '\\$1' );
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
		return makeLocalStyle( style + strong + em + strikethrough, state, endGround );
	}

	/**
	 * show bold/italic font based on both local and parent apostrophe states
	 * For internal link text inside parser function or template arguments, including file link caption
	 * @returns {?string} style
	 */
	function makeOrStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		}
		const orState = Object.assign( {}, state, { apos: {
			bold: state.apos.bold || state.parentApos.bold,
			italic: state.apos.italic || state.parentApos.italic
		} } );
		return makeStyle( style, orState, endGround );
	}

	/**
	 * show bold/italic font based on both local and parent apostrophe states, and show HTML-related styles
	 * For usual internal link text, including file link caption
	 * @returns {?string} style
	 */
	function makeOrFullStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		}
		const orState = Object.assign( {}, state, { apos: {
			bold: state.apos.bold || state.parentApos.bold,
			italic: state.apos.italic || state.parentApos.italic
		} } );
		return makeFullStyle( style, orState, endGround );
	}

	/**
	 * @typedef {function} eatFunc - not mutate state.tokenize and state.stack
	 * @returns {string} style
	 */
	/**
	 * @typedef {function} inFunc - mutate state.tokenize and/or state.stack
	 * @returns {(string|true|Array)} style or exit
	 */

	/**
	 * mutate state object
	 * @param {?Array.<string>} ground - properties to mutate
	 * @param {?number} [value=1] - value of increment
	 * @returns {undefined}
	 */
	function increment( state, ground, value ) {
		if ( ground ) {
			ground.forEach( function ( key ) {
				state[ key ] += value || 1;
			} );
		}
	}

	/**
	 * handle exit condition for inFunc
	 * WARNING: This function mutates state.stack and other properties
	 * @param {(string|true|Array)} result - return of an inFunc
	 * @returns {string} style
	 * @throws {string} style
	 */
	function handleExit( result, state, ground ) {
		var style, exit;
		if ( Array.isArray( result ) ) {
			style = result[ 0 ];
			exit = result[ 1 ];
		} else {
			style = result;
			exit = result;
		}
		if ( exit === true ) {
			state.tokenize = state.stack.pop();
			increment( state, ground, -1 );
			throw style === true ? undefined : style;
		}
		return style;
	}

	/**
	 * execute token once and exit
	 * @param {eatFunc} parser - token
	 * @param {?Array.<string>} ground - properties of stateObj to mutate
	 * @returns {undefined}
	 */
	function once( parser, stateObj, ground ) {
		stateObj.stack.push( stateObj.tokenize );
		stateObj.tokenize = function ( stream, state ) {
			state.tokenize = state.stack.pop();
			increment( state, ground );
			const style = parser( stream, state );
			increment( state, ground, -1 );
			return style;
		};
	}

	/**
	 * execute token until exit
	 * @param {inFunc} parser - token
	 * @param {?Array.<string>} ground - properties of stateObj to mutate
	 * @returns {undefined}
	 */
	function chain( parser, stateObj, ground ) {
		stateObj.stack.push( stateObj.tokenize );
		stateObj.tokenize = function ( stream, state ) {
			increment( state, ground );
			state.tokenize = token;
		};
		function token( stream, state ) {
			try {
				return handleExit( parser( stream, state ), state, ground );
			} catch ( e ) {
				return e;
			}
		}
	}

	/**
	 * chain token with a mutable option object
	 * @param {function} parser - token generator, takes an object as argument and returns an inFunc
	 * @param {?Object.<string, *>} option - a mutable object
	 * @param {?Array.<string>} ground - properties of stateObj to mutate
	 * @returns {undefined}
	 */
	function update( parser, stateObj, initOption, ground ) {
		stateObj.stack.push( stateObj.tokenize );
		stateObj.tokenize = function ( stream, state ) {
			increment( state, ground );
			state.tokenize = token( initOption );
		};
		function token( option ) {
			return function ( stream, state ) {
				try {
					return handleExit( parser( option )( stream, state ), state, ground );
				} catch ( e ) {
					state.tokenize = token( option );
					return e;
				}
			};
		}
	}

	/**
	 * greedy eat white spaces without returned styles
	 * @returns {(Array.<string>|false)} result of RegExp match or false
	 */
	function eatSpace( stream ) {
		return stream.match( /^[\s\xa0]+/ );
	}

	/**
	 * eat a specific number of characters
	 * @param {number} chars - number of characters to eat
	 */
	function eatChars( chars, makeFunc, style ) {
		return function ( stream, state ) {
			for ( var i = 0; i < chars; i++ ) {
				stream.next();
			}
			return makeFunc( style, state );
		};
	}

	/**
	 * eat until EOL
	 */
	function eatEnd( makeFunc, style ) {
		return function ( stream, state ) {
			stream.skipToEnd();
			return makeFunc( style, state );
		};
	}

	/**
	 * eat until a specified terminator
	 * Can be multiline
	 * @param {string} terminator - terminator string
	 */
	function eatBlock( makeFunc, style, terminator ) {
		return function ( streamObj, stateObj ) {
			stateObj.stack.push( stateObj.tokenize );
			stateObj.tokenize = function ( stream, state ) {
				if ( stream.skipTo( terminator ) ) {
					stream.match( terminator );
					state.tokenize = state.stack.pop();
				} else {
					stream.skipToEnd();
				}
				return makeFunc( style, state );
			};
			return stateObj.tokenize( streamObj, stateObj );
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
	 * token template (order not restricted)
	 * 1. SOL/EOL
	 * 2. plain text
	 * 3. unique syntax
	 * 4. valid wikitext
	 * 5. fallback
	 */

	/**
	 * eat general page name
	 * invalid characters: # < > [ ] { } |
	 * valid wikitext syntax: {{, {{{, &, <!--
	 * @param {Object.<string, boolean>} option - a mutable object
	 * @property {boolean} haveEaten
	 * @property {boolean} noComment
	 * @returns {?string}
	 */
	function eatPageName( makeFunc, style, option ) {
		return function ( stream, state ) {
			const pageStyle = style + ' mw-pagename';
			if ( eatSpace( stream ) ) {
				return makeFunc( option.haveEaten && !stream.eol() ? pageStyle : style, state );
			}
			const ch = stream.next();
			switch ( ch ) {
				case '#': // 3. unique syntax: # > [ ] } |
				case '>':
				case '[':
				case ']':
				case '}':
				case '|':
					return makeFunc( 'error', state );
				case '<':
					if ( !option.noComment && stream.match( '!--' ) ) { // 4. valid wikitext: <!--
						return eatComment( stream, state );
					}
					return makeFunc( 'error', state ); // 3. unique syntax: <
				case '{': // 4. valid wikitext: {{, {{{, &
				case '&':
					if ( ch !== '{' || state.peek() === '{' ) {
						option.haveEaten = true;
					}
					return eatWikiTextOther( makeFunc, pageStyle, { lbrace: 'error' } )( stream, state );
			}
			stream.match( /^[^#<>[\]{}|&\s\xa0]+/ ); // 2. plain text
			option.haveEaten = true;
			return makeFunc( pageStyle, state );
		};
	}

	/**
	 * eat HTML entities
	 * @param {string} style - base style
	 * @param {?string} errorStyle - style if not HTML entity
	 */
	function eatMnemonic( stream, style, errorStyle ) {
		/**
		 * @param {string} str - string after '&'
		 * @returns {boolean}
		 */
		function isEntity( str ) {
			if ( !span ) {
				return true;
			}
			span.innerHTML = '&' + str;
			return span.textContent.length === 1;
		}

		// no dangerous character should appear in results
		const entity = stream.match( /^(?:#x[a-f\d]+|#\d+|[a-z\d]+);/i );
		if ( entity ) {
			if ( isEntity( entity[ 0 ] ) ) {
				return ( style || '' ) + ' mw-mnemonic';
			}
			stream.backUp( entity[ 0 ].length );
		}
		return errorStyle === undefined ? style : errorStyle;
	}

	/**
	 * behavior switch
	 */
	function eatDoubleUnderscore( makeFunc, style ) {
		return function ( stream, state ) {
			const name = stream.match( /^__\w+?__/ );
			if ( name ) {
				const doubleUnderscore = mwConfig.doubleUnderscore;
				if ( name[ 0 ].toLowerCase() in doubleUnderscore[ 0 ] || name[ 0 ] in doubleUnderscore[ 1 ] ) {
					return 'mw-doubleUnderscore'; // has own background
				} else if ( !stream.eol() ) {
					// Leave last two underscore symbols for processing again in next iteration
					stream.backUp( 2 );
				}
			} else {
				stream.next();
				stream.next();
			}
			return makeFunc( style, state );
		};
	}

	/**
	 * eat section header when the number of ending characters is already known
	 * @param {number} count - number of ending characters
	 */
	function inSectionHeader( count, makeFunc ) {
		return function ( stream, state ) {
			if ( stream.sol() ) { // 1. SOL
				return true;
			} else if ( stream.match( /^[^{&'~[<]+/ ) ) { // 2. plain text
				if ( stream.eol() ) { // 1. EOL
					stream.backUp( count );
					once( eatEnd( makeLocalStyle, 'mw-section-header' ), state );
				}
				return makeFunc( '', state );
			}
			return eatWikiTextOther( makeFunc, '' )( stream, state ); // 4. common wikitext
		};
	}

	/**
	 * eat comment
	 */
	function eatComment( stream, state ) {
		return eatBlock( makeLocalStyle, 'mw-comment', '-->' )( stream, state );
	}

	/**
	 * normal internal link
	 * Cannot be multiline
	 * Unique syntax: |, ]], #
	 * @param {Object.<string, boolean>} option
	 * @property {boolean} invisible - whether there is link text
	 * @property {boolean} noComment - whether it is redirect
	 */
	function inLink( option ) {
		return function ( stream, state ) {
			var makeFunc;
			if ( option.invisible ) {
				makeFunc = makeLocalStyle;
			} else if ( state.nExt || state.nTemplate ) {
				makeFunc = makeOrStyle;
			} else {
				makeFunc = makeOrFullStyle;
			}
			if ( stream.sol() ) { // 1. SOL
				return true;
			}
			/* eslint-disable */
			// if ( stream.match( /^[\s\xa0]*#[\s\xa0]*/ ) ) { // 3. unique syntax: #
			// 	state.tokenize = inLinkToSection( invisible );
			// 	return makeFunc( 'mw-link', state );
			// } else if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
			// 	state.tokenize = eatLinkText;
			// 	state.nInvisible--;
			// 	if ( state.nLink === 1 ) {
			// 		state.parentApos = state.apos;
			// 		state.aposStack.push( state.apos );
			// 		state.apos = {};
			// 	}
			// 	return makeLocalStyle( 'mw-link-delimiter', state );
			// }
			/* eslint-enable */
			if ( stream.match( /^[\s\xa0]*]]/ ) ) { // 3. unique syntax: ]]
				return [ makeLocalStyle( 'mw-link-bracket', state, 'nLink' ), true ];
			}
			return eatPageName( makeFunc, 'mw-link-pagename', option )( stream, state );
		};

		/* eslint-disable */
		/**
		 * internal link hash
		 * Cannot be multiline
		 * Unique syntax: |, ]]
		 * Valid wikitext syntax: &, {{, {{{, <!--
		 * Invalid wikitext syntax: ~~~, HTML tags, complete extension tags
		 * Invalid characters: { } [ ]
		 */
		// function inLinkToSection( invisible ) {
		// 	const makeFunc = invisible ? makeLocalStyle : makeOrStyle;
		// 	return function ( stream, state ) {
		// 		if ( stream.sol() ) { // 1. stream.sol()
		// 		// @todo error message
		// 			state.nLink--;
		// 			state.tokenize = state.stack.pop();
		// 			if ( invisible ) {
		// 				state.nInvisible--;
		// 			}
		// 			return;
		// 		} else if ( stream.match( /^[^|\]{&~<[}]+/ ) ) { // 2. plain text
		// 			return makeFunc( 'mw-link-tosection', state );
		// 		} else if ( stream.eat( '|' ) ) { // 3. unique syntax: |
		// 			state.tokenize = eatLinkText;
		// 			state.nInvisible--;
		// 			if ( state.nLink === 1 ) {
		// 				state.parentApos = state.apos;
		// 				state.aposStack.push( state.apos );
		// 				state.apos = {};
		// 			}
		// 			return makeLocalStyle( 'mw-link-delimiter', state );
		// 		} else if ( stream.match( ']]' ) ) { // 3. unique syntax: ]]
		// 			state.tokenize = state.stack.pop();
		// 			state.nInvisible--;
		// 			return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
		// 		} else if ( stream.match( /^(?:&|{{|<!--)/, false ) ) { // 4. limited common wikitext
		// 			return eatWikiTextOther( makeFunc, 'mw-link-tosection' )( stream, state );
		// 		}
		// 		const mt = stream.match( /^(<\/?([A-Za-z\d]+)|~{3,5}|[{}[\]])/ );
		// 		if ( mt ) { // 4. invalid syntax or characters: tags, ~~~, {, }, [, ]
		// 			const fullname = mt[ 0 ],
		// 				name = ( mt[ 2 ] || '' ).toLowerCase();
		// 			if ( fullname[ 0 ] === '~' || name in mwConfig.tags || name in permittedHtmlTags ) {
		// 				state.nLink--;
		// 				state.tokenize = state.stack.pop();
		// 				if ( invisible ) {
		// 					state.nInvisible--;
		// 				}
		// 				if ( fullname[ 0 ] === '~' ) {
		// 					return makeFunc( 'error', state );
		// 				}
		// 				stream.backUp( fullname.length );
		// 			} else if ( !name ) {
		// 				return makeFunc( 'error', state );
		// 			}
		// 		} else {
		// 			stream.next();
		// 		}
		// 		return makeFunc( 'mw-link-tosection', state ); // 5. fallback
		// 	};
		// }

		/**
		 * internal link text
		 * Can be multiline
		 * Unique syntax: ]]
		 * Invalid wikitext syntax: [, [[, ~~~~, SPACE, #, *, ;, :
		 */
	// 	function eatLinkText( stream, state ) {
	// 		if ( stream.sol() ) { // 1. stream.sol()
	// 			if ( stream.match( /^(?:-{4}|=|[\s\xa0]*:*[\s\xa0]*{\|)/, false ) ) {
	// 				return eatWikiTextSol( makeOrStyle, 'mw-link-text' )( stream, state );
	// 			}
	// 		}
	// 		if ( stream.match( /^(?:[^\][~{&'<]+|\[(?!\[))/ ) ) { // 2. plain text
	// 			return makeOrStyle( 'mw-link-text', state );
	// 		}
	// 		const mt = stream.match( /^(?:]]|\[\[|~{3,4}(?!~))/ );
	// 		if ( mt ) { // 3. unique syntax: ]], [[, ~~~~
	// 			state.tokenize = state.stack.pop();
	// 			if ( state.nLink === 1 ) {
	// 				state.apos = state.aposStack.pop();
	// 				state.parentApos = {};
	// 			}
	// 			if ( mt[ 0 ] === ']]' ) {
	// 				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
	// 			}
	// 			state.nLink--;
	// 			if ( mt[ 0 ] === '[[' ) {
	// 				stream.backUp( 2 );
	// 				return;
	// 			}
	// 			return makeLocalStyle( 'error', state );
	// 		}
	// 		// 4. limited common wikitext: {{, {{{, &, '', <, ~~~~~
	// 		return eatWikiTextOther( makeOrStyle, 'mw-link-text' )( stream, state );
	// 	}
	/* eslint-enable */
	}

	/**
	 * free external link protocol
	 * Cannot be multiline
	 * Always used as fallback
	 * @param {string} restriction - escaped special characters for syntax
	 */
	function eatFreeExternalLink( makeFunc, style, restriction ) {
		const plainRegex = new RegExp( "^[^\\w{&_'~[\\]<>\\x80-\\x9f\\u00a1-\\uffff" + restriction + ']+' ),
			breakRegex = new RegExp( '[' + restriction + ']' ),
			urlRegex = new RegExp( '^[^\\s\\xa0[\\]<>"{&_\'~!)\\\\:;,.?' + restriction + ']+' );
		return function ( stream, state ) {
			// highlight free external links, bug T108448; cannot be multiline
			if ( stream.peek() !== '/' && stream.match( urlProtocols ) ) {
				if ( !stream.eol() ) {
					chain( inFreeExternalLink, state );
				}
				return makeFunc( 'mw-free-extlink-protocol', state );
			} else if ( /[\w\x80-\x9f\u00a1-\uffff]/.test( stream.next() ) ) { // \w and non-ascii unicode except \xa0
				stream.match( /^[A-Za-z\d\x80-\x9f\u00a1-\uffff]+/ ); // except '_'
			} else {
				stream.match( plainRegex ); // ascii except /[\w{}&'~[\]<>|:=#/!]/ and \xa0
			}
			return makeFunc( style, state );
		};

		/**
		 * free external link after protocol
		 * Cannot be multiline
		 * Unique syntax that breaks link: [, ], <, >, "
		 * Unique syntax that may break link: ! ) \ : ; , . ?
		 * Invalid wikitext syntax that breaks link: ~~~, ''
		 * Valid wikitext syntax: {{, {{{, &, __
		 */
		function inFreeExternalLink( stream, state ) {
			if ( stream.sol() ) { // 1. SOL
				return true;
			}
			const ch = stream.next();
			switch ( ch ) {
				case '[': // 3. unique syntax that breaks link: [, ], <, >, "
				case ']':
				case '<':
				case '>':
				case '"':
					stream.backUp( 1 );
					return true;
				case '{': // 4. valid wikitext: {{, {{{, &, __
				case '&':
				case '_':
					stream.backUp( 1 );
					return eatWikiTextOther( makeFunc, 'mw-free-extlink' )( stream, state );
				case '~':
					if ( stream.match( '~~', false ) ) { // 4. invalid wikitext: ~~~
						stream.backUp( 1 );
						return true;
					}
					break;
				case "'":
					if ( stream.peek() === "'" ) { // 4. invalid wikitext: ''
						stream.backUp( 1 );
						return true;
					}
					break;
				case '!': // 3. unique syntax that may break link: ! ) \ : ; , . ?
				case ')':
				case '\\':
				case ':':
				case ';':
				case ',':
				case '.':
				case '?':
					if ( stream.match( /[!)\\:;,.?]*(?:[\s\xa0]|$)/, false ) ) {
						stream.backUp( 1 );
						return true;
					}
					break;
				default:
					if ( breakRegex.test( ch ) ) {
						stream.backUp( 1 );
						return true;
					} else if ( eatSpace( stream ) ) {
						return true;
					}
			}
			stream.match( urlRegex ); // 2. plain text
			return makeFunc( 'mw-free-extlink', state );
		}
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
			var fallbackStyle = style;
			switch ( ch ) {
				case '-': // 3. valid wikitext: ----
					if ( stream.match( /^-{3,}/ ) ) {
						return 'mw-hr'; // has own background
					}
					fallbackStyle = style || '';
					break;
				case '=': { // 3. valid wikitext: =
					const mt = stream.match( /^(={0,5})(.+?(=\1[\s\xa0]*))$/ );
					if ( mt ) {
						stream.backUp( mt[ 2 ].length );
						chain( inSectionHeader( mt[ 3 ].length, makeFunc ), state );
						return makeLocalStyle(
							'mw-section-header line-cm-mw-section-' + ( mt[ 1 ].length + 1 ),
							state
						);
					}
					fallbackStyle = style || '';
					break;
				}
				case '#':
					stream.backUp( 1 );
					if ( stream.match( redirectRegex ) ) {
						update( inLink, state, { noComment: true, invisible: true } );
						once( eatChars( 2, makeLocalStyle, 'mw-link-bracket' ), state );
						return makeLocalStyle( 'mw-parserfunction-name', state );
					}
					stream.next();
					// fall through
				case '*': // 3. valid wikitext: *, ;
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
					if ( stream.match( redirectRegex ) ) {
						return makeLocalStyle( 'mw-parserfunction-name', state );
					}
					return 'mw-skipformatting'; // has own background
				}
			}
			return makeFunc( fallbackStyle, state ); // 5. fallback
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
			details = details || {}; // eslint-disable-line no-param-reassign
			const ch = stream.next();
			var errorStyle;
			switch ( ch ) {
				case '&': // valid wikitext: &
					return makeFunc( eatMnemonic( stream, style || '', details.amp ), state );
				case "'": {
					const mt = stream.match( /^'*/ ),
						chars = mt[ 0 ].length;
					switch ( chars ) {
						case 0:
							break;
						case 3: // total apostrophes =4
							stream.backUp( 3 );
							break;
						case 2: // valid wikitext: ''', bold
							state.apos.bold = !state.apos.bold;
							return makeLocalStyle( 'mw-apostrophes', state );
						case 1: // valid wikitext: '', italic
							state.apos.italic = !state.apos.italic;
							return makeLocalStyle( 'mw-apostrophes', state );
						default: // total apostrophes >5
							stream.backUp( 5 );
					}
					return makeFunc( details.apos === undefined ? style || '' : details.apos, state );
				}
				case '~': // valid wikitext: ~~~
					if ( stream.match( /^~{2,4}/ ) ) {
						return 'mw-signature'; // has own background
					}
					return makeFunc( details.tilde === undefined ? style || '' : details.tilde, state );
				case '_': { // valid wikitext: __
					const mt = stream.match( /^_+/ );
					errorStyle = details.lowbar === undefined ? style || '' : details.lowbar;
					if ( !mt || stream.eol() ) {
						// fallback
					} else {
						stream.backUp( 2 );
						once( eatDoubleUnderscore( makeFunc, errorStyle ), state );
					}
					return makeFunc( errorStyle, state );
				}
				case '[':
					errorStyle = details.lbrack === undefined ? style || '' : details.lbrack;
					break;
				case '{':
					errorStyle = details.lbrace === undefined ? style || '' : details.lbrace;
					break;
				case '<':
					if ( stream.match( '!--' ) ) {
						return eatComment( stream, state );
					}
					errorStyle = details.lt === undefined ? style || '' : details.lt;
			}
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

			return eatFreeExternalLink( makeFullStyle, style, '' )( stream, state ); // 5. fallback
		};
	}

	CodeMirror.defineMode( 'mediawiki', function ( config /* , parserConfig */ ) {
		mwConfig = config.mwConfig;
		mwConfig.redirect = mwConfig.redirect || [ '#REDIRECT' ];
		urlProtocols = new RegExp( '^(?:' + mwConfig.urlProtocols + ')', 'i' );
		redirectRegex = new RegExp( '^[\\s\\xa0]*(?:' + mwConfig.redirect.map( function ( word ) {
			return escapeRegExp( word );
		} ).join( '|' ) + ')[\\s\\xa0]*:?[\\s\\xa0]*(?=\\[\\[|\\[?$)', 'i' );

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
}( typeof global === 'object' ? global.CodeMirror : CodeMirror ) );
