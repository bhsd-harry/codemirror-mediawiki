( function ( CodeMirror ) {
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
	 * @property {boolean} bold
	 * @property {boolean} italic
	 * @property {boolean} dt
	 */

	/**
	 * @typedef state
	 * @type {object}
	 * @property {function} tokenize - current token
	 * @property {Array.<function>} stack - ancestor tokens
	 * @property {Array.<string>} InHtmlTag - ancestor HTML tags
	 * @property {Apos} apos - apostrophe states
	 * @property {Apos} parentApos - parent apostrophe states
	 * @property {Array.<Apos>} aposStack - ancestor apostrophe states
	 * @property {number} nTemplate - ancestor templates
	 * @property {number} nLink - ancestor links
	 * @property {number} nExt - ancestor parser functions
	 * @property {number} nInvisible - ancestor invisible syntax
	 */

	/**
	 * add background
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
	 * show bold/italic/strikethrough font in addition to background
	 * @returns {?string} style
	 */
	function makeStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		} else if ( state.nInvisible ) {
			return makeLocalStyle( style, state, endGround );
		}
		const strong = state.apos.bold || state.apos.dt ? ' strong' : '',
			em = state.apos.italic ? ' em' : '';
		/* eslint-disable no-tabs */
		/**
		 * @todo styles inside particular HTML tags
		 * @example
		 * const tags = state.InHtmlTag.join(),
		 *	strong = state.apos.bold || state.apos.dt || /\b(?:b|strong)\b/.test( tags ) ? ' strong' : '',
		 *	em = state.apos.italic || /\b(?:i|em)\b/.test( tags ) ? ' em' : '',
		 *	strikethrough = /\b(?:strike|s|del)\b/.test( tags ) ? ' strikethrough' : '';
		 */
		/* eslint-enable no-tabs */
		return makeLocalStyle( style + strong + em, state, endGround );
	}

	/**
	 * show bold/italic font based on both local and parent apostrophe states
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
		return makeStyle( style, orState, endGround );
	}

	/**
	 * recursively call a token, which must includes an exit statement
	 * @example
	 * state.tokenize = state.stack.pop();
	 * @param {function} parser - token
	 * @returns {function} same token
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
	 * reset apostrophe states
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
	 * eat comment
	 */
	const eatComment = chain( eatBlock( makeLocalStyle, 'mw-comment', '-->' ) );

	/**
	 * eat HTML entities
	 * @param {?string} style - default style
	 * @param {?string} errorStyle - style if not HTML entity
	 */
	function eatMnemonic( stream, style, errorStyle ) {
		/**
		 * @param {string} str - string after '&'
		 * @returns {boolean}
		 */
		function isEntity( str ) {
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
	 * eat general page name without syntax details
	 * @param {RegExp} regex - regex for plain text; must exclude [&#<~>[\]{}|]
	 * @param {Object.<'haveEaten', boolean>} option
	 * @returns {(string|undefined)}
	 */
	function eatPageName( regex, makeFunc, style, option ) {
		return function ( stream, state ) {
			// 1. not handling stream.sol() here
			if ( eatSpace( stream ) ) { // 2. plain text
				return makeFunc( style + ( option.haveEaten && !stream.eol() ? ' mw-pagename' : '' ), state );
			} else if ( stream.match( regex ) ) { // 2. plain text
				option.haveEaten = true;
				return makeFunc( style + ' mw-pagename', state );
			} else if ( stream.match( '<!--' ) ) { // 4. common wikitext: <!--
				return eatComment( stream, state );
			} else if ( stream.match( /^~{3,5}/ ) ) { // 4. common wikitext: ~~~
				return makeFunc( 'error', state );
			} else if ( stream.match( /^(?:[&~]|{{)/, false ) ) { // 4. common wikitext: &, {{, {{{
				option.haveEaten = true;
				const defaultStyle = style + ' mw-pagename',
					ampStyle = option.ampStyle === undefined ? defaultStyle : option.ampStyle;
				return eatWikiTextOther( makeFunc, '', {
					tilde: defaultStyle,
					lbrace: 'error',
					amp: ampStyle
				} )( stream, state );
			}
			stream.next(); // 5. fallback
			return makeFunc( 'error', state );
		};
	}

	/**
	 * eat section header when the number of ending characters is already known
	 * @param {number} count - number of ending characters
	 */
	function eatSectionHeader( count ) {
		return function ( stream, state ) {
			if ( stream.match( /^[^{&'~[<]+/ ) ) { // 2. plain text
				if ( stream.eol() ) { // 1. EOL
					stream.backUp( count );
					state.tokenize = eatBlock( makeLocalStyle, 'mw-section-header' );
				}
				return makeStyle( '', state );
			}
			return eatWikiTextOther( makeStyle, '' )( stream, state ); // 4. common wikitext
		};
	}

	/**
	 * template variable name
	 * Uncommon but possibly multiline
	 * Unique syntax: |, }}}
	 * Valid wikitext syntax: {{, {{{
	 */
	function inVariable( stream, state ) {
		// 1. nothing happens at stream.sol()
		if ( stream.match( /^[^|}{]+/ ) ) { // 2. plain text
			return makeLocalStyle( 'mw-templatevariable-name', state );
		} else if ( stream.eat( '|' ) ) { // 3. unique syntax: |
			state.tokenize = inVariableDefault( 'mw-templatevariable' );
			state.nInvisible--;
			return makeLocalStyle( 'mw-templatevariable-delimiter', state );
		} else if ( stream.match( '}}}' ) ) { // 3. unique syntax: }}}
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			return makeLocalStyle( 'mw-templatevariable-bracket', state );
		}
		// 4. limited common wikitext: {{, {{{; without fallback
		return eatWikiTextOther( makeLocalStyle, 'mw-templatevariable-name' )( stream, state );
	}

	/**
	 * template variable default
	 * Can be multiline, with line-start wikitext syntax valid
	 * Unique syntax: |, }}}
	 * Invalid wikitext syntax: {|
	 */
	function inVariableDefault( style ) {
		return function ( stream, state ) { // 1. stream.sol(), excluding {|
			if ( stream.sol() ) {
				state.apos = {}; // do not change state.aposStack
				if ( /[-=#*:; ]/.test( stream.peek() ) ) {
					return eatWikiTextSol( makeStyle, style )( stream, state );
				}
			}
			if ( stream.match( /^[^|}{&'~_[<]+/ ) ) { // 2. plain text
				return makeStyle( style, state );
			} else if ( stream.eat( '|' ) ) { // 3. unique syntax: | (redundant defaults)
				state.tokenize = inVariableDefault( 'error' );
				return makeLocalStyle( 'error', state );
			} else if ( stream.match( '}}}' ) ) { // 3. unique syntax: }}}
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-templatevariable-bracket', state );
			}
			// 4. common wikitext without fallback
			return eatWikiTextOther( makeStyle, style )( stream, state );
		};
	}

	/**
	 * parser function name
	 * Should not be multiline
	 * Unique syntax: :, }}
	 * Valid wikitext syntax: {{, {{{
	 */
	function inParserFunctionName( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol(), exit
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			state.nExt--;
			return;
		} else if ( stream.match( /^[^:}{]+/ ) ) { // 2. plain text
			return makeLocalStyle( 'mw-parserfunction-name', state );
		} else if ( stream.match( '}}' ) ) { // 3. unique syntax: }}
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
		} else if ( stream.eat( ':' ) ) { // 3. unique syntax: :
			state.aposStack.push( state.apos );
			state.apos = {};
			state.tokenize = inParserFunctionArguments( false );
			state.nInvisible--;
			return makeLocalStyle( 'mw-parserfunction-delimiter', state );
		} else if ( stream.match( '{{', false ) ) { // 4. limited common wikitext: {{, {{{
			return eatWikiTextOther( makeLocalStyle, 'error' )( stream, state );
		}
		stream.next();
		return makeLocalStyle( 'error', state ); // 5. fallback
	}

	/**
	 * parser function argument
	 * Can be multiline; white spaces (including newline) trimmed
	 * Apply local apostrophe states
	 * Unique syntax: |, }}
	 * Invalid wikitext syntax: {|
	 */
	function inParserFunctionArguments( haveEaten ) {
		return function ( stream, state ) {
			if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
				state.apos = {};
				state.tokenize = inParserFunctionArguments( false );
				return makeLocalStyle( 'mw-parserfunction-delimiter', state );
			} else if ( stream.match( /^[\s\xa0]*}}/ ) ) { // 3. unique syntax: }}
				state.tokenize = state.stack.pop();
				state.apos = state.aposStack.pop();
				return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
			} else if ( stream.sol() ) { // 1. stream.sol()
				clearApos( state ); // may be wrong if no non-whitespace characters eaten, but who knows?
				if ( ( haveEaten ? /[-=#*:; ]/ : /[#*:;]/ ).test( stream.peek() ) ) {
					return eatWikiTextSol( makeStyle, 'mw-parserfunction' )( stream, state );
				}
			}
			const mt = stream.match( /^[^|}&<[{~_']+/ );
			if ( mt ) { // 2. plain text
				if ( !haveEaten && /[^\s\xa0]/.test( mt[ 0 ] ) ) {
					state.tokenize = inParserFunctionArguments( true );
				}
				return makeStyle( 'mw-parserfunction', state );
			} else if ( !haveEaten && !stream.match( '<!--', false ) ) {
				state.tokenize = inParserFunctionArguments( true );
			}
			// 4. common wikitext without fallback
			return eatWikiTextOther( makeStyle, 'mw-parserfunction' )( stream, state );
		};
	}

	/**
	 * template page name
	 * Can be multiline, if the next line starts with '|' or '}}'
	 * Unique syntax: |, }}
	 */
	function eatTemplatePageName( option ) {
		return function ( stream, state ) {
			if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
				state.aposStack.push( state.apos );
				state.apos = {};
				state.tokenize = eatTemplateArgument( true, false );
				state.nInvisible--;
				return makeLocalStyle( 'mw-template-delimiter', state );
			} else if ( stream.match( /^[\s\xa0]*}}/ ) ) { // 3. unique syntax: }}
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
			} else if ( stream.sol() ) { // 1. stream.sol()
				// @todo error message
				state.nTemplate--;
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return;
			}
			// 2. plain text; 4. common wikitext; 5. fallback
			const style = eatPageName( /^[^\s\xa0|}&#<~>[\]{]+/, makeLocalStyle, 'mw-template-name', option )( stream, state );
			if ( option.haveEaten ) {
				state.tokenize = eatTemplatePageName( option );
			}
			return style;
		};
	}

	/**
	 * template argument
	 * Can be multiline; white spaces (including newline) trimmed
	 * Apply local apostrophe states
	 * Unique syntax: =, |, }}
	 * Invalid wikitext syntax: {|, =
	 */
	function eatTemplateArgument( expectArgName, haveEaten ) {
		return function ( stream, state ) {
			if ( expectArgName && stream.match( /^[^=|}{]*=/ ) ) { // 3. unique syntax: =
				state.tokenize = eatTemplateArgument( false, false );
				return makeLocalStyle( 'mw-template-argument-name', state );
			} else if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
				state.apos = {};
				state.tokenize = eatTemplateArgument( true, false );
				return makeLocalStyle( 'mw-template-delimiter', state );
			} else if ( stream.match( /^[\s\xa0]*}}/ ) ) { // 3. unique syntax: }}
				state.tokenize = state.stack.pop();
				state.apos = state.aposStack.pop();
				return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
			} else if ( stream.sol() ) { // 1. stream.sol()
				clearApos( state ); // may be wrong if no non-whitespace characters eaten, but who knows?
				if ( ( haveEaten ? /[-#*:; ]/ : /[#*:;]/ ).test( stream.peek() ) ) {
					return eatWikiTextSol( makeStyle, 'mw-template' )( stream, state );
				}
			}
			const ch = stream.peek();
			if ( /[^|}&<[{~_']/.test( ch ) ) { // 2. plain text
				if ( !haveEaten && /[^\s\xa0]/.test( ch ) ) {
					state.tokenize = eatTemplateArgument( expectArgName, true );
				}
				return eatFreeExternalLinkProtocol( 'mw-template', '}|' )( stream, state );
			} else if ( !haveEaten && !stream.match( '<!--', false ) ) {
				state.tokenize = eatTemplateArgument( expectArgName, true );
			}
			// 4. common wikitext without fallback
			return eatWikiTextOther( makeStyle, 'mw-template' )( stream, state );
		};
	}

	/**
	 * external link url without protocol
	 * Cannot be multiline
	 * Unique syntax: SPACE, ], '', [, [[, ~~~, <, >
	 * Valid wikitext syntax: &, {{, {{{
	 */
	function inExternalLink( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol()
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			state.nInvisible--;
		} else if ( stream.match( /^[^\s\xa0\]'~[<{&]+/ ) ) { // 2. plain text
			return makeLocalStyle( 'mw-extlink', state );
		} else if ( stream.match( /^[\s\xa0]*]/ ) ) { // 3. unique syntax: ]
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
		} else if ( eatSpace( stream ) ) { // 3. unique syntax: SPACE
			state.tokenize = inExternalLinkText;
			state.nInvisible--;
			return makeLocalStyle( '', state );
		} else if ( stream.match( /^~{3,5}/ ) ) { // 3. unique syntax: ~~~
			state.nLink--;
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			return makeStyle( 'error', state );
		} else if ( stream.match( '[[', false ) ) { // 3. unique syntax: [[
			state.nLink--;
			state.tokenize = state.stack.pop();
			state.nInvisible--;
		} else if ( stream.match( /^(?:[[<>]|'')/, false ) ) { // 3. unique syntax: [, <, >, ''
			state.tokenize = inExternalLinkText;
			state.nInvisible--;
		} else { // 4. limited common wikitext: &, {{, {{{; without fallback
			return eatWikiTextOther( makeLocalStyle, 'mw-extlink' )( stream, state );
		}
	}

	/**
	 * external link text
	 * Cannot be multiline
	 * Unique syntax: ], ~~~, [[
	 * Invalid wikitext syntax: [
	 */
	function inExternalLinkText( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol()
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			return;
		} else if ( stream.match( /^[^\]~[{&'<]+/ ) ) { // 2. plain text
			return makeStyle( 'mw-extlink-text', state );
		} else if ( stream.eat( ']' ) ) { // 3. unique syntax: ]
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
		} else if ( stream.match( /^(?:~{3,4}(?!~)|\[\[)/, false ) ) { // 3. unique syntax: ~~~, [[
			state.nLink--;
			state.tokenize = state.stack.pop();
		} else if ( stream.eat( '[' ) ) { // 4. invalid wikitext: [
			return makeStyle( 'mw-extlink-text', state );
		}
		// 4. common wikitext without fallback
		return eatWikiTextOther( makeStyle, 'mw-extlink-text' )( stream, state );
	}

	/**
	 * file link
	 * Cannot be multiline
	 * Unique syntax: |, ]]
	 */
	function inFileLink( streamObj, stateObj ) {
		if ( streamObj.sol() ) { // 1. SOL
			stateObj.nLink--;
			// @todo error message
			stateObj.tokenize = stateObj.stack.pop();
			stateObj.nInvisible--;
			return;
		} else if ( streamObj.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
			if ( stateObj.nLink === 1 ) {
				stateObj.parentApos = stateObj.apos;
				stateObj.aposStack.push( stateObj.apos );
				stateObj.apos = {};
			}
			stateObj.tokenize = eatFileLinkText;
			stateObj.nInvisible--;
			return makeLocalStyle( 'mw-link-delimiter', stateObj );
		} else if ( streamObj.match( /^[\s\xa0]*]]/ ) ) { // 3. unique syntax: ]]
			stateObj.tokenize = stateObj.stack.pop();
			stateObj.nInvisible--;
			return makeLocalStyle( 'mw-link-bracket', stateObj, 'nLink' );
		}
		// 2. plain text; 4. common wikitext; 5. fallback
		return eatPageName( /^[^\s\xa0|}&#<~>[\]{/:]+/, makeLocalStyle, 'mw-link-pagename', {
			haveEaten: true,
			ampStyle: 'error'
		} )( streamObj, stateObj );

		/**
		 * file link text
		 * Can be multiline
		 * Not differentiating parameters, so can be wrong
		 * Unique syntax: |, ]], =
		 * Invalid wikitext syntax: *, #, :, ;, SPACE
		 */
		function eatFileLinkText( stream, state ) {
			if ( stream.sol() ) { // 1. stream.sol()
				if ( stream.match( /^(?:-{4}|=|[\s\xa0]*:*[\s\xa0]*{\|)/, false ) ) {
					return eatWikiTextSol( makeStyle, 'mw-link-text' )( stream, state );
				}
			}
			if ( stream.match( /^[^\]|{&'~[<]+/ ) ) { // 2. plain text
				return makeStyle( 'mw-link-text', state );
			} else if ( stream.match( ']]' ) ) { // 3. unique syntax: ]]
				state.tokenize = state.stack.pop();
				if ( state.nLink === 1 ) {
					state.apos = state.aposStack.pop();
					state.parentApos = {};
				}
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			} else if ( stream.eat( '|' ) ) { // 3. unique syntax: |
				if ( state.nLink === 1 ) {
					state.apos = {};
				}
				return makeLocalStyle( 'mw-link-delimiter', state );
			}
			// 4. common wiki text without fallback
			return eatWikiTextOther( makeStyle, 'mw-link-text' )( stream, state );
		}
	}

	/**
	 * normal internal link
	 * Cannot be multiline
	 * Unique syntax: |, ]], #
	 */
	function inLink( invisible ) {
		const makeFunc = invisible ? makeLocalStyle : makeOrStyle;
		return function ( stream, state ) {
			if ( stream.sol() ) { // 1. stream.sol()
				state.nLink--;
				// @todo error message
				state.tokenize = state.stack.pop();
				if ( invisible ) {
					state.nInvisible--;
				}
				return;
			}
			if ( stream.match( /^[\s\xa0]*#[\s\xa0]*/ ) ) { // 3. unique syntax: #
				state.tokenize = inLinkToSection( invisible );
				return makeFunc( 'mw-link', state );
			} else if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
				state.tokenize = eatLinkText;
				state.nInvisible--;
				if ( state.nLink === 1 ) {
					state.parentApos = state.apos;
					state.aposStack.push( state.apos );
					state.apos = {};
				}
				return makeLocalStyle( 'mw-link-delimiter', state );
			} else if ( stream.match( /^[\s\xa0]*]]/ ) ) { // 3. unique syntax: ]]
				state.tokenize = state.stack.pop();
				if ( invisible ) {
					state.nInvisible--;
				}
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			}
			// 2. plain text; 4. common wikitext; 5. fallback
			return eatPageName( /^[^\s\xa0|\]#&<~>[{}]+/, makeFunc, 'mw-link-pagename', {} )( stream, state );
		};
	}

	/**
	 * internal link hash
	 * Cannot be multiline
	 * Unique syntax: |, ]]
	 * Valid wikitext syntax: &, {{, {{{, <!--
	 * Invalid wikitext syntax: ~~~, HTML tags, complete extension tags
	 * Invalid characters: { } [ ]
	 */
	function inLinkToSection( invisible ) {
		const makeFunc = invisible ? makeLocalStyle : makeOrStyle;
		return function ( stream, state ) {
			if ( stream.sol() ) { // 1. stream.sol()
				// @todo error message
				state.nLink--;
				state.tokenize = state.stack.pop();
				if ( invisible ) {
					state.nInvisible--;
				}
				return;
			} else if ( stream.match( /^[^|\]{&~<[}]+/ ) ) { // 2. plain text
				return makeFunc( 'mw-link-tosection', state );
			} else if ( stream.eat( '|' ) ) { // 3. unique syntax: |
				state.tokenize = eatLinkText;
				state.nInvisible--;
				if ( state.nLink === 1 ) {
					state.parentApos = state.apos;
					state.aposStack.push( state.apos );
					state.apos = {};
				}
				return makeLocalStyle( 'mw-link-delimiter', state );
			} else if ( stream.match( ']]' ) ) { // 3. unique syntax: ]]
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			} else if ( stream.match( /^(?:&|{{|<!--)/, false ) ) { // 4. limited common wikitext
				return eatWikiTextOther( makeFunc, 'mw-link-tosection' )( stream, state );
			}
			const mt = stream.match( /^(<\/?([A-Za-z\d]+)|~{3,5}|[{}[\]])/ );
			if ( mt ) { // 4. invalid syntax or characters: tags, ~~~, {, }, [, ]
				const fullname = mt[ 0 ],
					name = ( mt[ 2 ] || '' ).toLowerCase();
				if ( fullname[ 0 ] === '~' || name in mwConfig.tags || name in permittedHtmlTags ) {
					state.nLink--;
					state.tokenize = state.stack.pop();
					if ( invisible ) {
						state.nInvisible--;
					}
					if ( fullname[ 0 ] === '~' ) {
						return makeFunc( 'error', state );
					}
					stream.backUp( fullname.length );
				} else if ( !name ) {
					return makeFunc( 'error', state );
				}
			} else {
				stream.next();
			}
			return makeFunc( 'mw-link-tosection', state ); // 5. fallback
		};
	}

	/**
	 * internal link text
	 * Can be multiline
	 * Unique syntax: ]]
	 * Invalid wikitext syntax: [, [[, ~~~~, SPACE, #, *, ;, :
	 */
	function eatLinkText( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol()
			if ( stream.match( /^(?:-{4}|=|[\s\xa0]*:*[\s\xa0]*{\|)/, false ) ) {
				return eatWikiTextSol( makeOrStyle, 'mw-link-text' )( stream, state );
			}
		}
		if ( stream.match( /^(?:[^\][~{&'<]+|\[(?!\[))/ ) ) { // 2. plain text
			return makeOrStyle( 'mw-link-text', state );
		}
		const mt = stream.match( /^(?:]]|\[\[|~{3,4}(?!~))/ );
		if ( mt ) { // 3. unique syntax: ]], [[, ~~~~
			state.tokenize = state.stack.pop();
			if ( state.nLink === 1 ) {
				state.apos = state.aposStack.pop();
				state.parentApos = {};
			}
			if ( mt[ 0 ] === ']]' ) {
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			}
			state.nLink--;
			if ( mt[ 0 ] === '[[' ) {
				stream.backUp( 2 );
				return;
			}
			return makeLocalStyle( 'error', state );
		}
		// 4. limited common wikitext: {{, {{{, &, '', <, ~~~~~
		return eatWikiTextOther( makeOrStyle, 'mw-link-text' )( stream, state );
	}

	/**
	 * eat already known tag name
	 * @param {string} name - tag name in lower case
	 * @param {boolean} isCloseTag - truly closing tag
	 */
	function eatTagName( name, isCloseTag, isHtmlTag ) {
		return function ( stream, state ) {
			state.nInvisible++;
			state.tokenize = eatChars( name.length, makeLocalStyle, isHtmlTag ? 'mw-htmltag-name' : 'mw-exttag-name' );
			if ( isHtmlTag ) {
				state.stack.push( eatHtmlTagAttribute( name, isCloseTag ) );
			} else if ( isCloseTag ) { // extension tag
				state.stack.push( eatChars( 1, makeLocalStyle, 'mw-exttag-bracket' ) );
			} else {
				state.stack.push( eatExtTagAttribute( name ) );
			}
		};
	}

	/**
	 * HTML tag attribute
	 * Can be multiline
	 * Unique syntax: >, /, <
	 * Valid wikitext syntax: ~~~, &, {{, {{{, <
	 * @param {boolean} isCloseTag - truly closing
	 */
	function eatHtmlTagAttribute( name, isCloseTag ) {
		const style = 'mw-htmltag-attribute' + ( isCloseTag ? ' error' : '' );
		return function ( stream, state ) {
			// 1. nothings happens at stream.sol()
			if ( stream.match( /^[^>/<{&~]+/ ) ) { // 2. plain text
				return makeLocalStyle( style, state );
			} else if ( stream.eat( '>' ) ) { // 3. unique syntax: >
				if ( !( isCloseTag || name in voidHtmlTags ) ) {
					state.InHtmlTag.push( name );
				}
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return makeLocalStyle( 'mw-htmltag-bracket', state );
			} else if ( stream.match( '/>' ) ) { // 3. unique syntax: />
				if ( !( isCloseTag || name in voidHtmlTags ) ) { // HTML5 standard
					state.InHtmlTag.push( name );
				}
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return makeLocalStyle( 'mw-htmltag-bracket' + ( name in voidHtmlTags ? '' : ' error' ), state );
			} else if ( stream.eat( '<' ) ) { // 3. unique syntax: <
				if ( stream.match( '!--' ) ) {
					return eatComment( stream, state );
				}
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return;
			}
			// 4. limited common wikitext: {{, {{{, &, ~~~; without fallback
			return eatWikiTextOther( makeLocalStyle, style )( stream, state );
		};
	}

	/**
	 * extension tag attribute
	 * Can be multiline
	 * Unique syntax: >, /
	 * Valid wikitext syntax: &, {{, {{{
	 */
	function eatExtTagAttribute( name ) {
		return function ( stream, state ) {
			// 1. nothings happens at stream.sol()
			if ( stream.match( /^[^>/{&]+/ ) ) { // 2. plain text
				return makeLocalStyle( 'mw-exttag-attribute', state );
			} else if ( stream.eat( '>' ) ) { // 3. unique syntax: >
				state.extName = name;
				if ( name in mwConfig.tagModes ) {
					state.extMode = CodeMirror.getMode( { mwConfig: mwConfig }, mwConfig.tagModes[ name ] );
					state.extState = CodeMirror.startState( state.extMode );
				}
				state.tokenize = eatExtTagArea( name );
				state.nInvisible--;
				return makeLocalStyle( 'mw-exttag-bracket', state );
			} else if ( stream.match( '/>' ) ) { // 3. unique syntax: />
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return makeLocalStyle( 'mw-exttag-bracket', state );
			}
			// 4. limited common wikitext: {{, {{{, &; without fallback
			return eatWikiTextOther( makeLocalStyle, 'mw-exttag-attribute' )( stream, state );
		};
	}

	/**
	 * extension tag area
	 * Can be multiline
	 */
	function eatExtTagArea( name ) {
		return function ( stream, state ) {
			const origString = stream.string,
				from = stream.pos,
				pattern = new RegExp( '</' + name + '[\\s\\xa0]*>', 'i' ),
				m = pattern.exec( stream.string.slice( from ) );

			if ( m ) {
				if ( m.index === 0 ) {
					state.tokenize = eatExtCloseTag( m[ 0 ].length - 3 );
					state.extName = false;
					if ( state.extMode !== false ) {
						state.extMode = false;
						state.extState = false;
					}
					return;
				}
				stream.string = origString.slice( 0, m.index + from ); // inside tag only
			}

			state.stack.push( state.tokenize );
			state.tokenize = eatExtTokens( origString );
		};
	}

	/**
	 * simply eat already known closing extension tag
	 */
	function eatExtCloseTag( chars ) {
		return function ( stream, state ) {
			state.tokenize = eatChars( 2, makeLocalStyle, 'mw-exttag-bracket' );
			state.stack.push( eatExtCloseTagName( chars ) );
			state.nInvisible++;
		};
	}

	function eatExtCloseTagName( chars ) {
		return function ( stream, state ) {
			state.tokenize = eatChars( chars, makeLocalStyle, 'mw-exttag-name' );
			state.stack.push( eatChars( 1, makeLocalStyle, 'mw-exttag-bracket' ) );
			state.nInvisible--;
		};
	}

	/**
	 * extension tag tokens
	 */
	function eatExtTokens( origString ) {
		return function ( stream, state ) {
			var ret = 'mw-exttag';
			if ( state.extMode === false ) {
				stream.skipToEnd();
			} else {
				ret = 'mw-tag-' + state.extName + ' ';
				ret += state.extMode.token( stream, state.extState );
			}
			if ( stream.eol() ) {
				stream.string = origString;
				state.tokenize = state.stack.pop();
			}
			return ( state.extState.makeFunc || makeStyle )( ret, state );
		};
	}

	/**
	 * eat two characters of tabel start
	 */
	function eatStartTable( streamObj, stateObj ) {
		stateObj.stack.push( inTableDefinition );
		stateObj.nInvisible++;
		return eatChars( 2, makeLocalStyle, 'mw-table-bracket' )( streamObj, stateObj );

		/**
		 * definition of table and table row, not used for table caption or table cell
		 * Cannot be multiline
		 * Valid wikitext: {, &, ~, <!--
		 */
		function inTableDefinition( stream, state ) {
			if ( stream.sol() ) { // 1. SOL
				state.tokenize = inTable();
				state.nInvisible--;
				return;
			} else if ( stream.match( /^[^{&~<]+/ ) ) { // 2. plain text
				return makeLocalStyle( 'mw-table-definition', state );
			} else if ( stream.eat( '<' ) ) {
				if ( stream.match( '!--' ) ) { // 4. valid wikitext: <!--
					return eatComment( stream, state );
				}
				return makeLocalStyle( 'mw-table-definition', state ); // 5. fallback
			}
			// 4. valid wikitext: {, &, ~
			return eatWikiTextOther( makeLocalStyle, 'mw-table-definition' )( stream, state );
		}

		/**
		 * tbody
		 * Usually at stream.sol(); rarely outside table
		 * Unique syntax: |, |-, |+, |}, !
		 * @param {?string} haveEaten - '|' which has been eaten
		 */
		function inTable( haveEaten ) {
			return function ( stream, state ) {
				if ( haveEaten === '|' ) {
					if ( stream.eol() ) { // 3. unique syntax: |
						state.tokenize = eatTableRow( true, false );
						return;
					}
					const ch = stream.next();
					switch ( ch ) {
						case '-': // 3. unique syntax: |-
							state.tokenize = inTableDefinition;
							state.nInvisible++;
							return makeLocalStyle( 'mw-table-delimiter', state );
						case '+': // 3. unique syntax: |+
							state.tokenize = inTableCaption( true );
							return makeLocalStyle( 'mw-table-delimiter', state );
						case '}': // 3. unique syntax: |}
							state.tokenize = state.stack.pop();
							return makeLocalStyle( 'mw-table-bracket', state );
						default: // 3. unique syntax: |
							stream.backUp( 1 );
							state.tokenize = eatTableRow( true, false ); // 3. unique syntax: |
							return;
					}
				} else if ( stream.sol() ) { // 1. SOL
					eatSpace( stream );
					if ( stream.eat( '|' ) ) {
						state.tokenize = inTable( '|' );
						return makeLocalStyle( 'mw-table-delimiter', state );
					} else if ( stream.eat( '!' ) ) { // 3. unique syntax: !
						state.tokenize = eatTableRow( true, true );
						return makeLocalStyle( 'mw-table-delimiter', state );
					}
				}
				return eatWikiText( 'error' )( stream, state ); // 4. all common wikitext
			};
		}

		/**
		 * table caption
		 * Can be multiline
		 * Unique syntax: |, ! (not correctly handled yet)
		 * @param {boolean} expectAttr
		 */
		function inTableCaption( expectAttr ) {
			return function ( stream, state ) {
				if ( stream.sol() ) { // 1. SOL
					clearApos( state );
					const mt = stream.match( /^[\s\xa0]*[|!]/ );
					if ( mt ) { // 3. unique syntax: |, !
						state.tokenize = mt[ 0 ].endsWith( '|' ) ? inTable( '|' ) : eatTableRow( true, true );
						return makeLocalStyle( 'mw-table-delimiter', state );
					} else if ( expectAttr ) {
						state.tokenize = inTableCaption( false );
						return;
					}
				} else if ( expectAttr ) {
					const ch = stream.next();
					switch ( ch ) {
						case '|': // 3. unique syntax: |
							state.tokenize = inTableCaption( false );
							return makeLocalStyle( 'mw-table-delimiter2', state );
						case '~':
							if ( stream.match( /^~{2,3}(?!~)/, false ) ) { // ~~~ breaks definition
								state.tokenize = inTableCaption( false );
							}
							break;
						case '[':
							if ( expectAttr && stream.peek() === '[' ) { // internal link breaks definition
								state.tokenize = inTableCaption( false );
							}
					}
					stream.backUp( 1 );
				}
				return eatWikiText( 'mw-table-caption' )( stream, state ); // 4. all common wikitext
			};
		}

		/**
		 * table row
		 * Can be multiline
		 * Unique syntax: ||, !!, |, !
		 * @param {boolean} expectAttr
		 * @param {boolean} isHead - is table header; only depend on '!' at SOL
		 */
		function eatTableRow( expectAttr, isHead ) {
			return function ( stream, state ) {
				if ( stream.sol() ) { // 1. SOL
					clearApos( state );
					const mt = stream.match( /^[\s\xa0]*[|!]/ );
					if ( mt ) { // 3. unique syntax: |, !
						state.tokenize = mt[ 0 ].endsWith( '|' ) ? inTable( '|' ) : eatTableRow( true, true );
						return;
					}
					state.apos.dt = isHead;
					const style = eatWikiTextSol( makeStyle )( stream, state ); // 4. all common wikitext
					if ( style !== undefined ) {
						return style;
					}
				}
				state.apos.dt = isHead;
				if ( stream.match( /^[^|!{&'~[<_]+/ ) ) { // 2. plain text
					return makeStyle( '', state );
				}
				const ch = stream.next();
				switch ( ch ) {
					case '|': {
						const delimiter = stream.eat( '|' );
						if ( delimiter || expectAttr ) { // 3. unique syntax: ||, |
							state.apos = {};
							state.tokenize = eatTableRow( delimiter, isHead );
							return makeLocalStyle( 'mw-table-delimiter' + ( delimiter ? '' : '2' ), state );
						}
						break;
					}
					case '!':
						if ( isHead && stream.eat( '!' ) ) { // 3. unique syntax: !!
							state.apos = {};
							state.tokenize = eatTableRow( true, true );
							return makeLocalStyle( 'mw-table-delimiter', state );
						}
						break;
					case '~':
						if ( expectAttr && stream.match( /^~{2,3}(?!~)/, false ) ) { // ~~~ breaks definition
							state.tokenize = eatTableRow( false, isHead );
						}
						break;
					case '[':
						if ( expectAttr && stream.peek() === '[' ) { // internal link breaks definition
							state.tokenize = eatTableRow( false, isHead );
						}
				}
				stream.backUp( 1 );
				return eatWikiTextOther( makeStyle, '' )( stream, state );
			};
		}
	}

	/**
	 * free external link protocol
	 * Only called after eatWikiTextSol() at stream.sol()
	 * @param {string} restriction - escaped special characters
	 */
	function eatFreeExternalLinkProtocol( style, restriction ) {
		const regex = new RegExp( "^[^\\w{&'~[\\]<>\\x80-\\x9f\\u00a1-\\uffff" + restriction + ']+' );
		return function ( stream, state ) {
			// highlight free external links, bug T108448; cannot be multiline
			if ( !stream.match( '//', false ) && stream.match( urlProtocols ) ) {
				if ( !stream.eol() ) {
					state.stack.push( state.tokenize );
					state.tokenize = eatFreeExternalLink( restriction );
				}
				return makeStyle( 'mw-free-extlink-protocol', state );
			}
			if ( /[\w\x80-\x9f\u00a1-\uffff]/.test( stream.next() ) ) { // \w and non-ascii unicode except \xa0
				stream.match( /^[A-Za-z\d\x80-\x9f\u00a1-\uffff]+/ ); // except '_'
			} else { // ascii except /[\w{}&'~[\]<>|:=#/!]/ and \xa0
				stream.match( regex );
			}
			return makeStyle( style, state );
		};
	}

	/**
	 * free external link after protocol
	 * Cannot be multiline
	 * Unique syntax: [, ], <, >, "
	 * Invalid wikitext syntax: ~~~, ''
	 * Valid wikitext syntax: {{, {{{, &
	 * Invalid characters: ! ) \ : ; , . ?
	 */
	function eatFreeExternalLink( restriction ) {
		const regex = new RegExp( '[' + restriction + ']' ),
			plainRegex = new RegExp( '^[^\\s\\xa0[\\]<>"{&\'~!)\\\\:;,.?' + restriction + ']+' );
		return function ( stream, state ) {
			if ( stream.eol() ) { // 1. stream.eol() instead of stream.sol()
				// @todo error message
				state.tokenize = state.stack.pop();
				return;
			} else if ( regex.test( stream.peek() ) || stream.match( /^(?:[[\]<>"]|~{3}|'')/, false ) ) {
				// 3. unique syntax: [, ], <, >, "; 4. invalid common wikitext: ~~~, ''
				state.tokenize = state.stack.pop();
				return;
			} else if ( stream.match( plainRegex ) ) { // 2. plain text
				return makeStyle( 'mw-free-extlink', state );
			} else if ( /[{&]/.test( stream.peek() ) ) { // 4. limited common wikitext: {{, {{{, &
				return eatWikiTextOther( makeStyle, 'mw-free-extlink' )( stream, state );
			} else if ( stream.match( /[!)\\:;,.?]*(?=[\s\xa0]|$)/, false ) ) { // 3. invalid characters
				state.tokenize = state.stack.pop();
				return;
			}
			stream.next();
			return makeStyle( 'mw-free-extlink', state ); // 5. fallback
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
				case '=': { // 3. valid wikitext: =
					const tmp = stream.match( /^(={0,5})(.+?(=\1[\s\xa0]*))$/ );
					if ( tmp ) {
						stream.backUp( tmp[ 2 ].length );
						state.stack.push( state.tokenize );
						state.tokenize = eatSectionHeader( tmp[ 3 ].length );
						return makeLocalStyle(
							'mw-section-header line-cm-mw-section-' + ( tmp[ 1 ].length + 1 ),
							state
						);
					}
					break;
				}
				case '*': // 3. valid wikitext: *, #, ;
				case '#':
				case ';': {
					const mt = stream.match( /^[*#;:]*/ );
					if ( ch === ';' || /;/.test( mt[ 0 ] ) ) {
						state.apos.dt = true;
					}
					return makeLocalStyle( 'mw-list', state );
				}
				case ':':
					if ( stream.match( /^:*[\s\xa0]*(?={\|)/ ) ) { // 3. valid wikitext: :{|, bug T108454
						state.stack.push( state.tokenize );
						state.tokenize = eatStartTable;
					} else { // 3. valid wikitext: :
						const mt = stream.match( /^[*#;:]*/ );
						if ( /;/.test( mt[ 0 ] ) ) {
							state.apos.dt = true;
						}
					}
					return makeLocalStyle( 'mw-list', state );
				case ' ': {
					const mt = stream.match( /^[\s\xa0]*(:*)[\s\xa0]*(?={\|)/ ); // 3. valid wikitext: :{|
					if ( mt ) { // 3. valid wikitext: {|, bug T108454
						state.stack.push( state.tokenize );
						state.tokenize = eatStartTable;
						return makeLocalStyle( mt[ 1 ] ? 'mw-list' : '', state );
					}
					// 3. valid wikitext: SPACE
					return 'mw-skipformatting'; // has own background
				}
				case '{':
					if ( stream.peek() === '|' ) { // 3. valid wikitext: {|
						stream.backUp( 1 );
						state.stack.push( state.tokenize );
						return eatStartTable( stream, state );
					}
			}
			return makeFunc( style, state ); // 5. fallback
		};
	}

	/**
	 * other common wikitext syntax
	 * Always advances
	 * @param {?string} style - default style
	 * @param {?Object.<string, string>} details - individual default styles for different syntax
	 * @returns {?string}
	 */
	function eatWikiTextOther( makeFunc, style, details ) {
		return function ( stream, state ) {
			const ch = stream.next();
			details = details || {}; // eslint-disable-line no-param-reassign
			var errorStyle;
			switch ( ch ) {
				case '&': // valid wikitext: &
					return makeFunc( eatMnemonic( stream, style, details.amp ), state );
				case "'":
					if ( stream.match( /^'*(?='{5})/ ) || stream.match( /^'{3}(?!')/, false ) ) {
						// skip the irrelevant apostrophes ( >5 or =4 )
					} else if ( stream.match( "''" ) ) { // valid wikitext: ''', bold
						state.apos.bold = !state.apos.bold;
						return makeLocalStyle( 'mw-apostrophes', state );
					} else if ( stream.eat( "'" ) ) { // valid wikitext: '', italic
						state.apos.italic = !state.apos.italic;
						return makeLocalStyle( 'mw-apostrophes', state );
					}
					return makeFunc( details.apos === undefined ? style : details.apos, state );
				case '~':
					if ( stream.match( /^~{2,4}/ ) ) { // valid wikitext: ~~~
						return 'mw-signature'; // has own background
					}
					return makeFunc( details.tilde === undefined ? style : details.tilde, state );
				case '_': {
					var tmp = 1;
					while ( stream.eat( '_' ) ) { // Optimize processing of many underscore symbols
						tmp++;
					}
					if ( stream.eol() ) {
						// fallback
					} else if ( tmp > 2 ) { // Many underscore symbols
						// Leave last two underscore symbols for processing again in next iteration
						stream.backUp( 2 );
					} else if ( tmp === 2 ) { // Check on double underscore Magic Word
						const name = stream.match( /^.+?__/ );
						if ( name ) {
							const varname = '__' + name[ 0 ],
								underscore = mwConfig.doubleUnderscore;
							if ( varname.toLowerCase() in underscore[ 0 ] || varname in underscore[ 1 ] ) {
								return 'mw-doubleUnderscore'; // has own background
							} else if ( !stream.eol() ) {
								// Leave last two underscore symbols for processing again in next iteration
								stream.backUp( 2 );
							}
						}
					}
					return makeFunc( details.lowbar === undefined ? style : details.lowbar, state );
				}
				case '[': {
					errorStyle = details.lbrack === undefined ? style : details.lbrack;
					if ( stream.eat( '[' ) ) { // valid wikitext: [[
						eatSpace( stream );
						if ( /[^\]|[<>}]/.test( stream.peek() ) ) { // ignore invalid link
							state.nLink++;
							state.stack.push( state.tokenize );
							const mt = stream.match( nsFileRegex, false );
							if ( mt ) {
								state.stack.push( inFileLink );
								state.tokenize = eatChars( mt[ 0 ].length, makeLocalStyle, 'mw-link-pagename mw-pagename' );
								state.nInvisible++;
							} else if ( stream.match( /^[^\]]*\|/, false ) ) {
								state.tokenize = inLink( true );
								state.nInvisible++;
							} else {
								state.tokenize = inLink( false );
							}
							return makeLocalStyle( 'mw-link-bracket', state );
						}
					} else {
						const mt = stream.match( urlProtocols, false );
						if ( mt ) {
							state.nLink++;
							state.stack.push( state.tokenize );
							state.stack.push( inExternalLink );
							state.tokenize = eatChars( mt[ 0 ].length, makeLocalStyle, 'mw-extlink-protocol' );
							state.nInvisible++;
							return makeLocalStyle( 'mw-extlink-bracket', state );
						}
					}
					break;
				}
				case '{': {
					errorStyle = details.lbrace === undefined ? style : details.lbrace;
					// Template parameter (skip parameters inside a template transclusion, Bug: T108450)
					if ( !stream.match( '{{{{', false ) && stream.match( '{{' ) ) {
						eatSpace( stream );
						state.stack.push( state.tokenize );
						state.nInvisible++;
						state.tokenize = inVariable;
						return makeLocalStyle( 'mw-templatevariable-bracket', state );
					} else if ( stream.match( /^{[\s\xa0]*/ ) ) {
						state.nInvisible++;
						if ( stream.peek() === '#' ) { // Parser function
							state.nExt++;
							state.stack.push( state.tokenize );
							state.tokenize = inParserFunctionName;
							return makeLocalStyle( 'mw-parserfunction-bracket', state );
						}
						// Check for parser function without '#'
						const name = stream.match( /^([^\s\xa0}{:]+)(:|[\s\xa0]*)(}}?)?(.)?/, false );
						if ( name ) {
							if ( ( name[ 2 ] === ':' || name[ 3 ] === '}}' || name[ 3 ] === '}' && name[ 4 ] === undefined )
								&& ( name[ 1 ].toLowerCase() in mwConfig.functionSynonyms[ 0 ] || name[ 1 ] in mwConfig.functionSynonyms[ 1 ] )
							) {
								state.nExt++;
								state.stack.push( state.tokenize );
								state.tokenize = inParserFunctionName;
								return makeLocalStyle( 'mw-parserfunction-bracket', state );
							}
						}
						// Template
						state.nTemplate++;
						state.stack.push( state.tokenize );
						state.tokenize = eatTemplatePageName( { haveEaten: false } );
						return makeLocalStyle( 'mw-template-bracket', state );
					}
					break;
				}
				case '<': {
					errorStyle = details.lt === undefined ? style : details.lt;
					if ( stream.match( '!--' ) ) { // comment
						return eatComment( stream, state );
					}
					const isCloseTag = Boolean( stream.eat( '/' ) ),
						name = stream.match( /^[A-Za-z\d]+(?=[\s\xa0>]|\/>|$)/, false ); // HTML5 standard
					if ( name ) {
						var tagname = name[ 0 ].toLowerCase();
						if ( tagname in mwConfig.tags ) { // extension tag
							if ( isCloseTag === true ) {
								// @todo message
								return makeLocalStyle( 'error', state );
							}
							state.stack.push( state.tokenize );
							state.tokenize = eatTagName( tagname, isCloseTag, false );
							return makeLocalStyle( 'mw-exttag-bracket', state );
						} else if ( tagname in permittedHtmlTags ) { // Html tag
							if ( isCloseTag === true ) {
								if ( tagname !== state.InHtmlTag[ state.InHtmlTag.length - 1 ] ) {
									// @todo message
									return makeLocalStyle( 'error', state );
								}
								state.InHtmlTag.pop();
							}
							state.stack.push( state.tokenize );
							state.tokenize = eatTagName( tagname, isCloseTag, true );
							return makeLocalStyle( 'mw-htmltag-bracket', state );
						}
					}
					break;
				}
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

			result = eatWikiTextOther( makeStyle )( stream, state );
			if ( result !== undefined ) {
				return result;
			}
			stream.backUp( 1 );

			return eatFreeExternalLinkProtocol( style, '' )( stream, state ); // 5. including fallback
		};
	}

	/**
	 * eat <pre>
	 * Unique syntax: <nowiki>
	 * Valid wikitext: &
	 */
	function eatPre( stream, state ) {
		if ( stream.match( /^[^&<]+/ ) ) { // 2. plain text
			return '';
		}
		const ch = stream.next();
		switch ( ch ) {
			case '&': // 4. valid wikitext: &
				return eatMnemonic( stream, '' );
			case '<': // 3. unique syntax: <nowiki>
				if ( !state.nowiki && stream.match( 'nowiki>' ) || state.nowiki && stream.match( '/nowiki>' ) ) {
					state.nowiki = !state.nowiki;
					return 'mw-comment';
				}
				// fall through
			default: // 5. fallback
				return '';
		}
	}

	/**
	 * eat <nowiki>
	 * Valid wikitext: &
	 */
	function eatNowiki( stream ) {
		const ch = stream.next();
		if ( ch === '&' ) { // 4. valid wikitext: &
			return eatMnemonic( stream, '' );
		} else if ( !stream.skipTo( '&' ) ) { // 2. plain text
			stream.skipToEnd();
		}
		return '';
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

	CodeMirror.defineMode( 'mw-tag-pre', function ( /* config, parserConfig */ ) {
		return {
			startState: function () {
				return { nowiki: false };
			},
			copyState: function ( state ) {
				return { nowiki: state.nowiki };
			},
			token: eatPre
		};
	} );

	CodeMirror.defineMode( 'mw-tag-nowiki', function ( /* config, parserConfig */ ) {
		return { token: eatNowiki };
	} );
}( CodeMirror ) );
