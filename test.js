/**
 * @typedef {object} Apos
 * @property {boolean} bold - apostrophe '''
 * @property {boolean} italic - apostrophe ''
 * @property {number} dt - list containing ';'
 * @property {boolean} th - table cell starting with '!' at SOL
 * @property {number} strong - inside HTML tags <b> or <strong>
 * @property {number} em - inside HTML tags <i> or <em>
 * @property {number} del - inside HTML tags <s>, <del> or <strike>
 */

/**
 * @typedef {object} state
 * @property {token} tokenize - next token
 * @property {token[]} stack - ancestor tokens
 * @property {string[]} InHtmlTag - ancestor HTML tags
 * @property {Apos} apos - apostrophe states
 * @property {Apos} parentApos - parent apostrophe states
 * @property {Apos[]} aposStack - ancestor apostrophe states
 * @property {number} nTemplate - ancestor templates
 * @property {number} nLink - ancestor links
 * @property {number} nExt - ancestor parser functions
 * @property {number} nInvisible - ancestor invisible syntax
 * - parser function name
 * - template pagename
 * - template argument name
 * - template variable name
 * - internal link pagename if there is link text
 * - file link pagename
 * - external link
 * - tag attribute
 * - table definition
 */

/**
 * @typedef {function} parser
 * @param {stream} stream
 * @param {state} state
 * @returns {string|true|[string, true]} style or exit
 */
/**
 * @typedef {function} token
 * @extends parser
 * @property {string} name - token must have a name for debugging
 * @returns {string} style
 */
/**
 * @typedef {token} eatFunc - not mutate state.tokenize and state.stack
 */
/**
 * @typedef {parser} inFunc - mutate state.tokenize and/or state.stack
 */

/**
 * Basic rule: do not use function-scope variables
 */
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
			tr: true, noinclude: true, includeonly: true, onlyinclude: true, translate: true,
		},
		voidHtmlTags = { br: true, hr: true, wbr: true, img: true },
		nsFileRegex = getFileRegex();
	var span = typeof document === 'object' && document.createElement( 'span' ), // used for isEntity()
		parserConfig, mwConfig, urlProtocols, redirectRegex, imgKeyword;

	/**
	 * create RegExp for file links
	 * @returns {RegExp}
	 */
	function getFileRegex() {
		const nsIds = typeof mw === 'object'
				? mw.config.get( 'wgNamespaceIds' )
				: { file: 6, image: 6, ??????: 6, ??????: 6, ??????: 6, ??????: 6, ??????: 6 },
			nsFile = Object.keys( nsIds ).filter( function ( ns ) {
				return nsIds[ ns ] === 6;
			} ).join( '|' );
		return new RegExp( '^([\\s\\xa0]*)((?:' + nsFile + ')[\\s\\xa0]*:[\\s\\xa0]*)', 'i' );
	}

	/**
	 * set function name for debugging
	 * @param {token} tokenize
	 * @param {string} name
	 */
	function setName( tokenize, name ) {
		Object.defineProperty( tokenize, 'name', { value: name } );
	}

	/**
	 * update state.errors by adding new error message
	 * @param {string} key - error message key
	 * @param {?string} arg - additional argument to replace $1 in message templates
	 */
	function newError( state, key, arg ) {
		if ( typeof CodeMirror.errorMsgs === 'object' ) {
			const msg = CodeMirror.errorMsgs[ key ];
			state.errors.unshift( arg === undefined ? msg : msg.replace( '$1', CodeMirror.errorMsgs[ arg ] || arg ) );
		} else {
			state.errors.unshift( key );
		}
	}

	/**
	 * escape string before creating RegExp
	 * @param {string} str
	 * @returns {string}
	 */
	function escapeRegExp( str ) {
		return str.replace( /[\\{}()|.?*+\-^$[\]]/g, '\\$&' );
	}

	/**
	 * add background
	 * For invisible content
	 * @param {string} style - base style
	 * @param {?string} endGround - key for decrement
	 * @returns {?string} style
	 * @todo deprecate endGround
	 */
	function makeLocalStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		} else if ( !/\berror\b/.test( style ) && state.nInvisible < 0 ) {
			newError( 'negative-invisible' );
			return style + ' error';
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
		if ( typeof global === 'object' && state.nInvisible ) {
			ground += '-invisible';
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
	 * @todo deprecate endGround
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
			italic: state.apos.italic || state.parentApos.italic,
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
			italic: state.apos.italic || state.parentApos.italic,
			dt: state.apos.dt || state.parentApos.dt,
			th: state.apos.th || state.parentApos.th,
		} } );
		return makeFullStyle( style, orState, endGround );
	}

	/**
	 * mutate state object
	 * @param {?string[]} ground - properties to mutate
	 * @param {?number} [value=1] - value of increment
	 */
	function increment( state, ground, value ) {
		if ( Array.isArray( ground ) ) {
			ground.forEach( function ( key ) {
				state[ key ] += value || 1;
			} );
		} else if ( typeof ground === 'string' ) {
			state[ ground ] += value || 1;
		}
	}

	/**
	 * handle exit condition for inFunc
	 * This function mutates state.stack
	 * @param {string|true|[string, true]} result - return of an inFunc
	 * @returns {string} style
	 * @throws {string} style
	 */
	function handleExit( result, state, endGround ) {
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
			increment( state, endGround, -1 );
			throw style === true ? undefined : style;
		}
		return style;
	}

	/**
	 * execute token once and exit
	 * @param {token} tokenize - eatFunc or generated by eatFunc
	 * @param {?string[]} ground - properties of stateObj to increment
	 * @param {?string[]} endGround - properties of stateObj to decrement when exiting
	 */
	function once( tokenize, stateObj, ground, endGround ) {
		stateObj.stack.push( stateObj.tokenize );
		stateObj.tokenize = function ( stream, state ) {
			state.tokenize = state.stack.pop();
			increment( state, ground );
			const style = tokenize( stream, state );
			increment( state, endGround, -1 );
			return style;
		};
		setName( stateObj.tokenize, tokenize.name );
	}

	/**
	 * execute token until exit
	 * @param {parser} parser - inFunc or generated by inFunc
	 * @param {?string[]} ground - properties of stateObj to increment
	 * @param {?string[]} endGround - properties of stateObj to decrement when exiting
	 */
	function chain( parser, stateObj, ground, endGround ) {
		stateObj.stack.push( stateObj.tokenize );
		stateObj.tokenize = function ( stream, state ) {
			increment( state, ground );
			setName( tokenize, parser.name );
			state.tokenize = tokenize;
		};
		function tokenize( stream, state ) {
			try {
				return handleExit( parser( stream, state ), state, endGround );
			} catch ( e ) {
				return e;
			}
		}
	}

	/**
	 * chain token with a mutable option object
	 * This function may only increments state object properties but not decrement
	 * This function should not be nested.
	 * @param {function} parser - token generator, takes an object as argument and returns an inFunc
	 * @param {?Object.<string, *>} option - a mutable object
	 * @param {?Array.<string>} ground - properties of stateObj to increment
	 * @param {?Array.<string>} endGround - properties of stateObj to decrement when exiting
	 * @returns {undefined}
	 */
	function update( parser, stateObj, initOption, ground, endGround ) {
		stateObj.stack.push( stateObj.tokenize );
		stateObj.tokenize = function ( stream, state ) {
			increment( state, ground );
			state.tokenize = token( initOption );
		};
		function token( option ) {
			const name = 'update_' + parser.name;
			setName( updateToken, name );
			return updateToken;
			function updateToken( stream, state ) {
				try {
					const style = handleExit( parser( option )( stream, state ), state, endGround );
					if ( state.tokenize.name === name ) { // do not update if another token is nested
						state.tokenize = token( option );
					}
					return style;
				} catch ( e ) {
					return e;
				}
			}
		}
	}

	/**
	 * greedy eat white spaces without returned styles
	 * This is not an eatFunc, despite its name
	 * @returns {string[]|false} result of RegExp match or false
	 */
	function eatSpace( stream ) {
		return stream.match( /^[\s\xa0]+/ );
	}

	/**
	 * eat a specific number of characters
	 * @param {number} count - number of characters to eat
	 * @returns {eatFunc}
	 */
	function chars( count, makeFunc, style ) {
		return eatChars;
		function eatChars( stream, state ) {
			for ( var i = 0; i < count; i++ ) {
				stream.next();
			}
			return makeFunc( style, state );
		}
	}

	/**
	 * eat until EOL
	 * @returns {eatFunc}
	 */
	function toEnd( makeFunc, style ) {
		return eatEnd;
		function eatEnd( stream, state ) {
			stream.skipToEnd();
			return makeFunc( style, state );
		}
	}

	/**
	 * eat until a specified terminator
	 * Can be multiline
	 * @param {string} terminator - terminator string
	 * @param {?string} name - token name
	 * @returns {eatFunc}
	 */
	function block( makeFunc, style, terminator, name ) {
		return function ( streamObj, stateObj ) {
			stateObj.stack.push( stateObj.tokenize );
			stateObj.tokenize = eatBlock;
			if ( name ) {
				setName( eatBlock, name );
			}
			return eatBlock( streamObj, stateObj );
		};
		function eatBlock( stream, state ) {
			if ( stream.skipTo( terminator ) ) {
				stream.match( terminator );
				state.tokenize = state.stack.pop();
			} else {
				stream.skipToEnd();
			}
			return makeFunc( style, state );
		}
	}

	/**
	 * reset apostrophe states and <dt> states
	 * @param {boolean} recursive - whether to reset ancestor states
	 */
	function clearApos( state, recursive ) {
		function clear( apos ) {
			Object.assign( apos, { bold: false, italic: false, dt: false } );
		}
		clear( state.apos );
		if ( recursive && state.nLink === 0 ) {
			state.aposStack.forEach( clear );
			clear( state.parentApos );
		}
	}

	/**
	 * mutate apostrophe states associated with HTML tags
	 * @param {string} key - properties to mutate
	 * @param {?number} [value=1] - value of increment
	 * @returns {undefined}
	 */
	function incrementApos( state, key, value ) {
		state.apos[ key ] += value || 1;
		state.parentApos[ key ] += value || 1;
		state.aposStack.forEach( function ( apos ) {
			apos[ key ] += value || 1;
		} );
	}

	/**
	 * special characters that can start wikitext syntax:
	 * line start : - = # * : ; SPACE {
	 * other      : { & ' ~ _ [ < :
	 * details
	 * ----       : <hr> (line start)
	 * =          : <h1> ~ <h6> (line start)
	 * #          : <ol> (line start)
	 * *          : <ul> (line start)
	 * ;          : <dt> (line start)
	 * :          : <dd> (line start or after ';')
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
	 * parser template (order not restricted)
	 * 1. SOL/EOL
	 * 2. plain text
	 * 3. unique syntax
	 * 4. valid wikitext
	 * 5. fallback
	 */

	/**
	 * eat general page name
	 * Invalid characters: # < > [ ] { } |
	 * Valid wikitext syntax: {{, {{{, &, <!--
	 * @type {eatFunc}
	 * @param {object} option - a mutable object
	 * @property {boolean} haveEaten
	 * @property {boolean} redirect
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
					newError( state, 'invalid-char-pagename', ch );
					return makeFunc( 'error', state );
				case '<':
					if ( !option.redirect && stream.match( '!--' ) ) { // 4. valid wikitext: <!--
						return eatComment( stream, state );
					}
					newError( state, 'invalid-char-pagename', '<' );
					return makeFunc( 'error', state ); // 3. unique syntax: <
				case '{':
				case '&': {
					if ( ch === '{' && stream.peek() !== '{' ) { // 3. unique syntax: {
						newError( state, 'invalid-char-pagename', '{' );
						return makeFunc( 'error', state );
					}
					// 4. valid wikitext: {{, {{{, &
					option.haveEaten = true;
					stream.backUp( 1 );
					const result = eatWikiTextOther( makeFunc, pageStyle, { lbrace: 'error' } )( stream, state );
					if ( /\berror\b/.test( result ) ) {
						newError( state, 'invalid-char-pagename', '{' );
					}
					return result;
				}
				case '~':
					if ( stream.match( /^~{2,4}/ ) ) { // 4. invalid wikitext: ~~~
						newError( 'sign-pagename' );
						return makeFunc( 'error', state );
					}
			}
			stream.match( /^[^#<>[\]{}|&~\s\xa0]+/ ); // 2. plain text
			option.haveEaten = true;
			return makeFunc( pageStyle, state );
		};
	}

	/**
	 * eat general attribute
	 * Unique syntax: ', ", =
	 * Valid wikitext except extension tags: {{, {{{, <!--
	 * Valid wikitext in attribute value: &
	 * Invalid character in HTML tags: <
	 * Invalid wikitext except extension tags: ~~~
	 * Invalid wikitext in table: HTML tags (if not quoted), extension tags
	 * Basic syntax: name ; name = value ; name = "value" ; name = 'value'
	 * @param {object} option
	 * @property {boolean} name - whether it is an attribute name
	 * @property {?string} quote - only for attribute values
	 */
	function eatAttribute( style, isKey ) {
		return function ( stream, state ) {
		};
	}

	/**
	 * eat HTML entities
	 * @type {eatFunc}
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
	 * @returns {eatFunc}
	 */
	function doubleUnderscore( makeFunc, style ) {
		return eatDoubleUnderscore;
		function eatDoubleUnderscore( stream, state ) {
			const name = stream.match( /^__\w+?__/ );
			if ( name ) {
				const config = mwConfig.doubleUnderscore;
				if ( name[ 0 ].toLowerCase() in config[ 0 ] || name[ 0 ] in config[ 1 ] ) {
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
		}
	}

	/**
	 * eat section header when the number of ending characters is already known
	 * @param {number} count - number of ending characters
	 * @returns {inFunc}
	 */
	function sectionHeader( count, makeFunc ) {
		return inSectionHeader;
		function inSectionHeader( stream, state ) {
			if ( stream.sol() ) { // 1. SOL
				return true;
			} else if ( stream.match( /^[^{&'~[<_]+/ ) ) { // 2. plain text
				if ( stream.eol() ) { // 1. EOL
					stream.backUp( count );
					once( toEnd( makeLocalStyle, 'mw-section-header' ), state );
				}
				return makeFunc( '', state );
			}
			return eatWikiTextOther( makeFunc, '' )( stream, state ); // 4. common wikitext
		}
	}

	/**
	 * eat comment
	 * @type {eatFunc}
	 */
	function eatComment( stream, state ) {
		return block( makeLocalStyle, 'mw-comment', '-->', 'eatComment' )( stream, state );
	}

	/**
	 * external link after protocol
	 * @param {object} option
	 * @property {boolean} invisible - whether there is link text
	 */
	function inExternalLink( option ) {
		return externalLink;

		/**
		 * external link url without protocol
		 * Cannot be multiline
		 * Unique syntax: SPACE, ], '', [, [[, ~~~, <, >
		 * Valid wikitext syntax: &, {{, {{{
		 */
		function externalLink( stream, state ) {
			/**
			 * prepare state for inExternalLinkText()
			 */
			function changeToText() {
				state.nInvisible--;
				option.invisible = false;
			}

			const makeFunc = state.nExt || state.nTemplate ? makeStyle : makeFullStyle;
			if ( !option.invisible ) { // must be returned from inExternalLinkText()
				if ( stream.sol() ) {
					newError( state, 'open-link', 'external' );
					state.nLink--;
					return [ 'error', true ];
				} else if ( stream.eat( ']' ) ) { // 3. unique syntax: ]
					return [ makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' ), true ];
				}
				chain( inExternalLinkText, state );
				return;
			} else if ( stream.sol() ) { // 1. SOL
				newError( state, 'open-link', 'external' );
				state.nLink--;
				state.nInvisible--;
				return [ 'error', true ];
			}
			const ch = stream.next();
			switch ( ch ) {
				case ']': // 3. unique syntax: ]
					state.nInvisible--;
					return [ makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' ), true ];
				case '[': // 3. unique syntax: [
					changeToText();
					if ( stream.eat( '[' ) ) {
						newError( state, 'link-in-link', 'external' );
						return makeFunc( 'error', state );
					}
					return makeFunc( 'mw-extlink-text', state );
				case "'":
					if ( stream.peek() === "'" ) { // 4. invalid wikitext: ''
						changeToText();
						stream.backUp( 1 );
						return;
					}
					break;
				case '~':
					if ( stream.match( /^~{2,4}/ ) ) { // 4. invalid wikitext: ~~~
						changeToText();
						newError( state, 'sign-in-link', 'external' );
						return makeFunc( 'error', state );
					}
					break;
				case '&': // 4. valid wikitext: &, {{, {{{
				case '{':
					stream.backUp( 1 );
					return eatWikiTextOther( makeLocalStyle, 'mw-extlink' )( stream, state );
				case '<':
					if ( stream.match( '!--' ) ) { // 4. valid wikitext: <!--
						return eatComment( stream, state );
					}
					changeToText(); // 3. unique syntax: <
					stream.backUp( 1 );
					return;
				default:
					if ( /[\s\xa0>]/.test( ch ) ) { // 3. unique syntax: SPACE, >
						changeToText();
						return makeFunc( 'mw-extlink-text', state );
					}
			}
			stream.match( /^[^[\]'~&{<>\s\xa0]+/ ); // 2. plain text
			return makeLocalStyle( 'mw-extlink', state );
		}

		/**
		 * external link text
		 * Cannot be multiline
		 * Unique syntax: ], ~~~, [[
		 * Invalid wikitext syntax: [
		 */
		function inExternalLinkText( stream, state ) {
			const makeFunc = state.nExt || state.nTemplate ? makeStyle : makeFullStyle;
			if ( stream.sol() || stream.peek() === ']' ) { // 1. SOL; 3. unique syntax: ]
				return true;
			}
			switch ( stream.next() ) {
				case '[': // 4. invalid wikitext: [
					if ( stream.eat( '[' ) ) {
						newError( state, 'link-in-link', 'external' );
						return makeFunc( 'error', state );
					}
					return makeFunc( 'mw-extlink-text', state );
				case '~': { // 4. valid wikitext: ~~~~~; invalid wikitext: ~~~~
					const mt = stream.match( /^~{0,4}/ );
					switch ( mt[ 0 ].length ) {
						case 4:
							return 'mw-signature'; // has own background
						case 2:
						case 3:
							newError( state, 'sign-in-link', 'external' );
							return makeFunc( 'error', state );
					}
					return makeFunc( 'mw-extlink-text', state );
				}
				case '{': // 4. valid wikitext: {{, {{{, &, '', <
				case '&':
				case "'":
				case '<':
					stream.backUp( 1 );
					return eatWikiTextOther( makeFunc, 'mw-extlink-text' )( stream, state );
			}
			stream.match( /^[^[\]~{&'<]+/ ); // 2. plain text
			return makeStyle( 'mw-extlink-text', state );
		}
	}

	/**
	 * file link
	 * @param {Object.<string, boolean>} option
	 * @property {boolean} invisible - whether it is link text
	 * @property {boolean} section - whether it is an invalid section link
	 * @property {boolean} haveEaten - only meaningful for link text
	 */
	function inFileLink( option ) {
		return fileLink;

		/**
		 * Cannot be multiline
		 * Unique syntax: |, ]]
		 */
		function fileLink( stream, state ) {
			if ( !option.invisible ) { // link text
				return eatFileLinkText( option )( stream, state );
			} else if ( stream.sol() ) { // 1. SOL
				newError( state, 'open-link', 'file' );
				state.nLink--;
				state.nInvisible--;
				return [ 'error', true ];
			}
			const mt = stream.match( /^[\s\xa0]*([|\]]|{{[\s\xa0]*![\s\xa0]*}})/ );
			if ( mt ) {
				switch ( mt[ 1 ] ) {
					case ']':
						if ( stream.eat( ']' ) ) { // 3. unique syntax: ]]
							state.nInvisible--;
							return [ makeLocalStyle( 'mw-link-bracket', state, 'nLink' ), true ];
						}
						// 3. invalid character: ]
						newError( state, 'fail-close-link', 'file' );
						return makeLocalStyle( 'error', state );
					default: // 3. unique syntax: |
						state.nInvisible--;
						option.invisible = false;
						if ( state.nLink === 1 ) { // cannot mutate parent apostrophe states
							state.parentApos = state.apos;
							state.aposStack.push( state.apos );
							state.apos = {};
						}
						return makeLocalStyle( 'mw-link-delimiter', state );
				}
			} else if ( option.section || stream.eat( '#' ) ) { // 3. unique syntax: invalid section link
				stream.match( /^[^|{\]]+/ );
				newError( state, 'file-section' );
				return makeLocalStyle( 'error', state );
			}
			return eatPageName( makeLocalStyle, 'mw-link-pagename', { haveEaten: true } )( stream, state );
		}

		/**
		 * file link text
		 * Can be multiline
		 * Trying to identify image link keywords
		 * Unique syntax: |, ]]
		 * Invalid wikitext syntax: *, #, :, ;, SPACE
		 * @param {Object.<'haveEaten', boolean>} options - only used for keyword identification
		 */
		function eatFileLinkText( options ) {
			return fileLinkText;
			function fileLinkText( stream, state ) {
				const makeFunc = state.nExt || state.nTemplate ? makeOrStyle : makeOrFullStyle;
				if ( !options.haveEaten && stream.match( imgKeyword ) ) {
					options.haveEaten = true;
					return makeLocalStyle( 'mw-link-attribute', state );
				}
				const ch = stream.peek();
				if ( stream.sol() ) { // 1. SOL
					switch ( ch ) {
						case ' ':
						case '\xa0':
						case ':':
						case '{':
							if ( !stream.match( /^[\s\xa0]*:*[\s\xa0]*{(?:\||{{[\s\xa0]*![\s\xa0]*}})/, false ) ) {
								break;
							}
							// fall through
						case '-': // 4. valid wikitext: ----, =, {|
						case '=':
							option.haveEaten = true;
							return eatWikiTextSol( makeFunc, 'mw-link-text' )( stream, state );
					}
				}
				stream.next();
				switch ( ch ) {
					case '{':
						if ( !stream.match( /^{[\s\xa0]*![\s\xa0]*}}/ ) ) { // valid wikitext: {{, {{{
							stream.backUp( 1 );
							option.haveEaten = true;
							return eatWikiTextOther( makeFunc, 'mw-link-text' )( stream, state );
						}
						// fall through
					case '|': // 3. unique syntax: |
						option.haveEaten = false;
						if ( state.nLink === 1 ) {
							state.apos = {};
						}
						return makeLocalStyle( 'mw-link-delimiter', state );
					case '<':
						if ( stream.match( '!--' ) ) { // 4. valid wikitext: <!--
							return eatComment( stream, state );
						}
						// fall through
					case '&': // 4. valid wikitext: <, &, '', ~~~, [[, [
					case "'":
					case '~':
					case '[':
						stream.backUp( 1 );
						option.haveEaten = true;
						return eatWikiTextOther( makeFunc, 'mw-link-text' )( stream, state );
					case ']':
						if ( stream.eat( ']' ) ) { // 3. unique syntax: ]]
							if ( state.nLink === 1 ) {
								state.apos = state.aposStack.pop();
								state.parentApos = {};
							}
							return [ makeLocalStyle( 'mw-link-bracket', state, 'nLink' ), true ];
						}
						option.haveEaten = true;
						newError( state, 'fail-close-link', 'file' );
						return makeFunc( 'error', state );
					default:
						if ( /[\s\xa0]/.test( ch ) ) {
							eatSpace( stream );
							return makeFunc( 'mw-link-text', state );
						}
				}
				option.haveEaten = true;
				stream.backUp( 1 );
				return eatFreeExternalLink( makeFunc, 'mw-link-text', '\\|\\{' )( stream, state );
			}
		}
	}

	/**
	 * normal internal link
	 * @param {Object.<string, boolean>} option
	 * @property {boolean} invisible - whether there may be link text
	 * @property {boolean} redirect - whether it is redirect; this is a superset of option.invisible
	 */
	function inLink( option ) {
		return link;

		/**
		 * Cannot be multiline
		 * Unique syntax: |, ]], #
		 */
		function link( stream, state ) {
			var makeFunc;
			if ( option.redirect || option.invisible ) {
				makeFunc = makeLocalStyle;
			} else if ( state.nExt || state.nTemplate ) {
				makeFunc = makeOrStyle;
			} else {
				makeFunc = makeOrFullStyle;
			}
			if ( stream.sol() ) { // 1. SOL
				newError( state, 'open-link', 'internal' );
				if ( option.invisible ) {
					state.nInvisible--;
				}
				state.nLink--;
				return [ 'error', true ];
			}
			const mt = stream.match( /^[\s\xa0]*([#|\]]|{{[\s\xa0]*![\s\xa0]*}})/ );
			if ( mt ) {
				switch ( mt[ 1 ] ) {
					case '#': // 3. unique syntax: #
						chain( inLinkToSection( option ), state );
						return makeFunc( 'mw-link', state );
					case ']':
						if ( stream.eat( ']' ) ) { // 3. unique syntax: ]]
							if ( option.invisible ) {
								state.nInvisible--;
							}
							return [ makeLocalStyle( 'mw-link-bracket', state, 'nLink' ), true ];
						}
						// 3. invalid character: ]
						newError( state, 'fail-close-link', 'internal' );
						return makeFunc( 'error', state );
					default: // 3. unique syntax: |
						if ( option.invisible ) {
							state.nInvisible--;
							option.invisible = false;
						}
						if ( state.nLink === 1 ) { // cannot mutate parent apostrophe states
							state.parentApos = state.apos;
							state.aposStack.push( state.apos );
							state.apos = {};
						}
						chain( inLinkText( option.redirect ), state );
						return makeLocalStyle( 'mw-link-delimiter', state );
				}
			}
			return eatPageName( makeFunc, 'mw-link-pagename', option )( stream, state );
		}

		/**
		 * internal link hash
		 * Cannot be multiline
		 * Unique syntax: |, ]]
		 * Invalid characters: { } [ ]
		 * Valid wikitext syntax: &, {{, {{{, <!--
		 * Invalid wikitext syntax: ~~~, HTML tags, closed extension tags
		 * @param {Object.<string, boolean>} options - immutable here
		 * @property {boolean} invisible - whether there may be link text
		 * @property {boolean} redirect - whether it is redirect; this is a superset of option.invisible
		 */
		function inLinkToSection( options ) {
			return linkToSection;
			function linkToSection( stream, state ) {
				var makeFunc;
				if ( options.redirect || options.invisible ) {
					makeFunc = makeLocalStyle;
				} else if ( state.nExt || state.nTemplate ) {
					makeFunc = makeOrStyle;
				} else {
					makeFunc = makeOrFullStyle;
				}
				if ( stream.sol() ) { // 1. SOL
					return true;
				}
				const ch = stream.next();
				switch ( ch ) {
					case ']':
						if ( stream.peek() !== ']' ) { // 3. invalid character: ]
							newError( state, 'fail-close-link', 'internal' );
							return makeFunc( 'error', state );
						}
						// fall through
					case '|': // 3. unique syntax: ]], |
						stream.backUp( 1 );
						return true;
					case '{':
						if ( stream.peek() === '{' ) { // 4. valid wikitext: {{, {{{
							stream.backUp( 1 );
							if ( stream.match( /^{{[\s\xa0]*![\s\xa0]*}}/, false ) ) {
								return true;
							}
							return eatWikiTextOther( makeFunc, 'mw-link-tosection' )( stream, state );
						}
						// fall through
					case '}': // 3. invalid characters: {, }, [
					case '[':
						newError( state, 'invalid-char-link-section', ch );
						return makeFunc( 'error', state );
					case '&': // 4. valid wikitext: &
						return makeFunc( eatMnemonic( stream, 'mw-link-tosection' ), state );
					case '<': {
						const mt = stream.match( /^(?:!--|(\/?)([A-Za-z\d]+)(?=[\s\xa0>]|\/>|$))/ );
						if ( !mt ) {
							break;
						} else if ( mt[ 0 ] === '!--' ) { // 4. valid wikitext: <!--
							return eatComment( stream, state );
						}
						const name = mt[ 2 ].toLowerCase();
						// 4. invalid wikitext: HTML tag or closed extension tag (only opening tag is found here)
						if ( name in permittedHtmlTags ) {
							newError( state, 'tag-in-link-section', 'html' );
							return makeFunc( 'error', state );
						} else if ( name in mwConfig.tags && !mt[ 1 ] ) {
							newError( state, 'tag-in-link-section', 'extension' );
							return makeFunc( 'error', state );
						}
						break;
					}
					case '~':
						if ( stream.match( /^~{2,4}/ ) ) { // 4. invalid wikitext: ~~~
							newError( 'sign-in-link', 'internal' );
							return makeFunc( 'error', state );
						}
						break;
				}
				stream.match( /^[^[\]|{}&<~]+/ ); // 2. plain text
				return makeFunc( 'mw-link-tosection', state );
			}
		}

		/**
		 * internal link text
		 * Can be multiline
		 * Unique syntax: ]]
		 * Invalid wikitext syntax: [, [[, ~~~~, SPACE, #, *, ;, :
		 * @param {boolean} redirect - whether it is redirect
		 */
		function inLinkText( redirect ) {
			const style = redirect ? 'error' : 'mw-link-text';
			return linkText;
			function linkText( stream, state ) {
				var makeFunc;
				if ( redirect ) {
					makeFunc = makeLocalStyle;
				} else if ( state.nExt || state.nTemplate ) {
					makeFunc = makeOrStyle;
				} else {
					makeFunc = makeOrFullStyle;
				}
				const ch = stream.peek();
				if ( stream.sol() && !redirect ) { // 1. SOL
					switch ( ch ) {
						case ' ':
						case '\xa0':
						case ':':
						case '{':
							if ( !stream.match( /^[\s\xa0]*:*[\s\xa0]*{\|/, false ) ) {
								break;
							}
							// fall through
						case '-': // 4. valid wikitext: ----, =, {|
						case '=':
							return eatWikiTextSol( makeFunc, style )( stream, state );
					}
				}
				stream.next();
				switch ( ch ) {
					case '{': // 4. valid wikitext: {{, {{{, &, '', <
					case '&':
					case "'":
					case '<': {
						stream.backUp( 1 );
						const result = eatWikiTextOther( makeFunc, style )( stream, state );
						if ( redirect ) {
							newError( state, 'link-text-redirect' );
							return makeFunc( 'error', state );
						}
						return result;
					}
					case ']':
						if ( stream.peek() === ']' ) { // 3. unique syntax: ]]
							stream.backUp( 1 );
							if ( state.nLink === 1 ) {
								state.apos = state.aposStack.pop();
								state.parentApos = {};
							}
							return true;
						}
						newError( state, 'fail-close-link', 'internal' );
						return makeFunc( 'error', state );
					case '[':
						if ( stream.eat( '[' ) ) { // 4. invalid wikitext: [[
							newError( state, 'link-in-link', 'internal' );
							return makeFunc( 'error', state );
						}
						break;
					case '~':
						if ( stream.match( /^~{2,3}/ ) ) {
							if ( stream.eat( '~' ) ) { // 4. valid wikitext: ~~~~~
								return 'mw-signature'; // has own background
							}
							newError( state, 'sign-in-link', 'internal' );
							return makeFunc( 'error', state ); // 4. invalid wikitext: ~~~~
						}
				}
				stream.match( /^[^{&'<[\]~]+/ ); // 2. plain text
				if ( redirect ) {
					newError( state, 'link-text-redirect' );
				}
				return makeFunc( style, state );
			}
		}
	}

	/**
	 * template variable
	 */
	function inVariable() {
		return variable;

		/*
		 * template variable name
		 * Uncommon but possibly multiline
		 * Unique syntax: |, }}}
		 * Valid wikitext syntax: {{, {{{
		 */
		function variable( stream, state ) {
			switch ( stream.next() ) {
				case '|': // 3. unique syntax: |
					state.nInvisible--;
					update( inVariableDefault, state, { first: true } );
					return makeLocalStyle( 'mw-templatevariable-delimiter', state );
				case '{': // 4. valid wikitext: {{, {{{
					stream.backUp( 1 );
					return eatWikiTextOther( makeLocalStyle, 'mw-templatevariable-name' )( stream, state );
				case '}':
					if ( stream.match( '}}' ) ) { // 3. unique syntax: }}}
						state.nInvisible--;
						return [ makeLocalStyle( 'mw-templatevariable-bracket', state ), true ];
					}
			}
			stream.match( /^[^|}{]+/ ); // 2. plain text
			return makeLocalStyle( 'mw-templatevariable-name', state );
		}

		/**
		 * template variable default
		 * Can be multiline
		 * Unique syntax: |, }}}
		 * Invalid wikitext syntax: {|
		 * @param {Object.<'first', boolean>} option
		 * @property {boolean} first - only first default is valid
		 */
		function inVariableDefault( option ) {
			const style = option.first ? 'mw-templatevariable' : 'error';
			return variableDefault;
			function variableDefault( stream, state ) {
				const makeFunc = state.nExt || state.nTemplate ? makeStyle : makeFullStyle,
					ch = stream.peek();
				if ( stream.sol() ) { // 1. SOL
					state.apos = {}; // do not change state.aposStack
					if ( option.first ) {
						switch ( ch ) {
							case ' ':
							case '\xa0':
							case ':':
								if ( stream.match( /^[\s\xa0]*:*[\s\xa0]*{\|/, false ) ) { // 4. invalid wikitext: {|
									break;
								}
								// fall through
							case '-': // 4. valid wikitext: SPACE, -, =, #, *, ;, :
							case '=':
							case '#':
							case '*':
							case ';':
								return eatWikiTextSol( makeFunc, 'mw-templatevariable' )( stream, state );
						}
					}
				}
				stream.next();
				switch ( ch ) {
					case '|': // 3. unique syntax: |
						option.first = false;
						return makeLocalStyle( 'mw-templatevariable-delimiter', state );
					case '}':
						if ( stream.match( '}}', false ) ) { // 3. unique syntax: }}}
							state.nInvisible++;
							stream.backUp( 1 );
							return true;
						}
						break;
					case '&':
					case "'":
					case '~':
					case '_':
					case '<':
					case '[':
					case ':':
						if ( !option.first ) {
							break;
						}
						// fall through
					case '{': { // 4. valid wikitext
						stream.backUp( 1 );
						const result = eatWikiTextOther( makeFunc, style )( stream, state );
						if ( /\berror\b/.test( result ) ) {
							newError( state, 'variable-default' );
						}
						return result;
					}
				}
				if ( option.first ) {
					stream.match( /^[^|}{&'~_[<]+/ );
				} else {
					stream.match( /^[^|}{]+/ );
					newError( state, 'variable-default' );
				}
				return makeFunc( style, state ); // 2. plain text
			}
		}
	}

	/**
	 * template
	 * Unique syntax: |, }}
	 * @todo full parser
	 */
	function inTemplate( stream, state ) {
		if ( stream.match( '}}' ) ) {
			state.nInvisible--;
			return [ makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' ), true ];
		} else if ( stream.eat( '|' ) ) {
			return makeLocalStyle( 'mw-template-delimiter', state );
		} else if ( stream.sol() ) {
			return eatWikiTextSol( makeLocalStyle, 'mw-template' )( stream, state );
		}
		return eatWikiTextOther( makeLocalStyle, 'mw-template' )( stream, state );
	}

	/**
	 * free external link protocol
	 * Cannot be multiline
	 * Always used as fallback
	 * @param {string} restriction - escaped special characters for syntax
	 */
	function eatFreeExternalLink( makeFunc, style, restriction ) {
		const plainRegex = new RegExp( "^[^\\w{&_'~[\\]<>\\x80-\\x9f\\u00a1-\\uffff" + restriction + ']+' ),
			breakRegex = new RegExp( '[\\s\\xa0[\\]<>"' + restriction + ']' ),
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
			if ( breakRegex.test( ch ) ) { // high priority
				stream.backUp( 1 );
				return true;
			}
			switch ( ch ) {
				case '{': // 4. valid wikitext: {{, {{{, &, __
				case '&':
				case '_':
					stream.backUp( 1 );
					return eatWikiTextOther( makeFunc, 'mw-free-extlink' )( stream, state );
				case '~':
					if ( stream.match( /^~{2,4}/ ) ) { // 4. invalid wikitext: ~~~
						return [ 'mw-signature', true ];
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
					if ( state.nInvisible === 0 && stream.match( /^-{3,}/ ) ) {
						return 'mw-hr'; // has own background
					}
					fallbackStyle = style || '';
					break;
				case '=': { // 3. valid wikitext: =
					const mt = stream.match( /^(={0,5})(.+?(=\1[\s\xa0]*))$/ );
					if ( mt ) {
						stream.backUp( mt[ 2 ].length );
						chain( sectionHeader( mt[ 3 ].length, makeFunc ), state );
						return makeLocalStyle(
							'mw-section-header line-cm-mw-section-' + ( mt[ 1 ].length + 1 ),
							state,
						);
					}
					fallbackStyle = style || '';
					break;
				}
				case '#':
					if ( state.nInvisible ) {
						fallbackStyle = style || '';
						break;
					}
					stream.backUp( 1 );
					if ( stream.match( redirectRegex ) ) {
						update( inLink, state, { redirect: true }, 'nInvisible', 'nInvisible' );
						once( chars( 2, makeLocalStyle, 'mw-link-bracket' ), state, 'nLink' );
						return makeLocalStyle( 'mw-parserfunction-name', state );
					}
					stream.next();
					// fall through
				case '*': // 3. valid wikitext: *, ;
				case ';': {
					if ( state.nInvisible ) {
						fallbackStyle = style || '';
						break;
					}
					const mt = stream.match( /^[*#;:]*/ );
					if ( ch === ';' || /;/.test( mt[ 0 ] ) ) {
						state.apos.dt = Number( ch === ';' ) + mt[ 0 ].split( ';' ).length - 1;
					}
					return makeLocalStyle( 'mw-list', state );
				}
				case ':': {
					if ( state.nInvisible ) {
						fallbackStyle = style || '';
						break;
					}
					const mt = stream.match( /^[*#;:]*/ );
					if ( /;/.test( mt[ 0 ] ) ) {
						state.apos.dt = mt[ 0 ].split( ';' ).length - 1;
					}
					return makeLocalStyle( 'mw-list', state );
				}
				case ' ':
				case 'xa0': {
					if ( state.nInvisible ) {
						fallbackStyle = style || '';
						break;
					} else if ( stream.match( redirectRegex ) ) {
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
	 * @property colon - ':'
	 * @returns {?string}
	 */
	function eatWikiTextOther( makeFunc, style, details ) {
		return function ( stream, state ) {
			details = details || {}; // eslint-disable-line no-param-reassign
			var errorStyle, mt;
			switch ( stream.next() ) {
				case '&': // valid wikitext: &
					return makeFunc( eatMnemonic( stream, style || '', details.amp ), state );
				case "'":
					if ( state.nInvisible === 0 ) {
						mt = stream.match( /^'*/ );
						const count = mt[ 0 ].length;
						switch ( count ) {
							case 0:
								break;
							case 3: // total apostrophes =4
								stream.backUp( 3 );
								break;
							case 4:
								stream.backUp( 2 );
								// fall through
							case 2: // valid wikitext: ''', bold
								state.apos.bold = !state.apos.bold;
								return makeLocalStyle( 'mw-apostrophes', state );
							case 1: // valid wikitext: '', italic
								state.apos.italic = !state.apos.italic;
								return makeLocalStyle( 'mw-apostrophes', state );
							default: // total apostrophes >5
								stream.backUp( 5 );
						}
					}
					return makeFunc( details.apos === undefined ? style || '' : details.apos, state );
				case '~': // valid wikitext: ~~~
					if ( stream.match( /^~{2,4}/ ) ) {
						return 'mw-signature'; // has own background
					}
					return makeFunc( details.tilde === undefined ? style || '' : details.tilde, state );
				case '_': // valid wikitext: __
					mt = stream.match( /^_+/ );
					errorStyle = details.lowbar === undefined ? style || '' : details.lowbar;
					if ( mt && !stream.eol() ) {
						stream.backUp( 2 );
						once( doubleUnderscore( makeFunc, errorStyle ), state );
					}
					return makeFunc( errorStyle, state );
				case '[':
					if ( state.nInvisible ) {
						break;
					}
					errorStyle = details.lbrack === undefined ? style || '' : details.lbrack;
					if ( stream.eat( '[' ) ) { // valid wikitext: [[
						state.nLink++;
						mt = stream.match( nsFileRegex, false );
						if ( mt ) {
							update( inFileLink, state, { invisible: true }, 'nInvisible' );
							once( chars( mt[ 2 ].length, makeLocalStyle, 'mw-link-pagename mw-pagename' ), state );
							once( chars( mt[ 1 ].length, makeLocalStyle, 'mw-link-pagename' ), state );
						} else {
							const invisible = stream.match( /^[^\]]+[|{]/, false ); // if uncertain, regard it invisible
							update( inLink, state, { invisible: invisible }, invisible ? 'nInvisible' : null );
						}
						return makeLocalStyle( 'mw-link-bracket', state );
					}
					mt = stream.match( urlProtocols, false );
					if ( mt ) { // valid wikitext: [
						state.nLink++;
						update( inExternalLink, state, { invisible: true }, 'nInvisible' );
						once( chars( mt[ 0 ].length, makeLocalStyle, 'mw-extlink-protocol' ), state );
						return makeLocalStyle( 'mw-extlink-bracket', state );
					}
					break;
				case '{': {
					errorStyle = details.lbrace === undefined ? style || '' : details.lbrace;
					// Template parameter (skip parameters inside a template transclusion, Bug: T108450)
					mt = stream.match( /^{*/, false );
					const length = mt[ 0 ].length;
					if ( length === 2 && !stream.match( /^{{2}[^{}]+}}(?!})/, false )
						|| length === 4 && stream.match( /^{{4}[^{}]+}}(?!})/, false )
						|| length > 4
					) {
						stream.next();
						stream.next();
						chain( inVariable(), state, 'nInvisible' );
						return makeLocalStyle( 'mw-templatevariable-bracket', state );
					} else if ( length === 1 || length === 4
						|| length === 3 && !stream.match( /^{{3}[^{}]+}}}/, false )
					) {
						state.nTemplate++;
						stream.next();
						// @todo parser function
						chain( inTemplate, state, 'nInvisible' );
						return makeLocalStyle( 'mw-template-bracket', state );
					}
					break;
				}
				case '<':
					if ( stream.match( '!--' ) ) { // valid wikitext: <!--
						return eatComment( stream, state );
					}
					errorStyle = details.lt === undefined ? style || '' : details.lt;
					break;
				case ':': // likely to be rare
					if ( state.apos.dt > 0 ) {
						state.apos.dt--;
						return makeLocalStyle( 'mw-list', state );
					}
					errorStyle = details.colon === undefined ? style || '' : details.colon;
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
		return wikiText;
		function wikiText( stream, state ) {
			var result;

			if ( stream.sol() ) { // 1. SOL
				clearApos( state );
				result = eatWikiTextSol( makeFullStyle )( stream, state );
				if ( result !== undefined ) {
					return result;
				}
				stream.backUp( 1 );
			}

			result = eatWikiTextOther( makeFullStyle )( stream, state ); // 4. common wikitext
			if ( result !== undefined ) {
				return result;
			}
			stream.backUp( 1 );

			return eatFreeExternalLink( makeFullStyle, style, '' )( stream, state ); // 5. fallback
		}
	}

	CodeMirror.defineMode( 'mediawiki', function ( config /* , parserConfig */ ) {
		parserConfig = config;
		mwConfig = config.mwConfig;
		urlProtocols = new RegExp( '^(?:' + mwConfig.urlProtocols + ')', 'i' );
		redirectRegex = new RegExp( '^[\\s\\xa0]*(?:' + mwConfig.redirect.map( function ( word ) {
			return escapeRegExp( word );
		} ).join( '|' ) + ')[\\s\\xa0]*:?[\\s\\xa0]*(?=\\[\\[|\\[?$)', 'i' );
		imgKeyword = new RegExp( '^[\\s\\xa0]*(?:' + Object.keys( mwConfig.img ).map( function ( word ) {
			return escapeRegExp( word ).replace( '\\$1', '[^|{\\]]*' );
		} ).join( '|' ) + ')[\\s\\xa0]*(?=\\||{{[\\s\\xa0]*![\\s\\xa0]*}}|]]|$)' );

		return {
			startState: function () {
				return {
					tokenize: eatWikiText( '' ),
					stack: [], InHtmlTag: [], errors: [],
					apos: {}, parentApos: {}, aposStack: [],
					extName: false, extMode: false, extState: false,
					nTemplate: 0, nLink: 0, nExt: 0, nInvisible: 0,
				};
			},
			copyState: function ( state ) {
				return {
					tokenize: state.tokenize,
					stack: state.stack.concat( [] ),
					InHtmlTag: state.InHtmlTag.concat( [] ),
					errors: state.errors.concat( [] ),
					apos: Object.assign( {}, state.apos ),
					parentApos: Object.assign( {}, state.parentApos ),
					aposStack: state.aposStack.concat( [] ),
					extName: state.extName,
					extMode: state.extMode,
					extState: state.extMode !== false && CodeMirror.copyState( state.extMode, state.extState ),
					nTemplate: state.nTemplate,
					nLink: state.nLink,
					nExt: state.nExt,
					nInvisible: state.nInvisible,
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
			},
		};
	} );

	CodeMirror.defineMIME( 'text/mediawiki', 'mediawiki' );
}( CodeMirror ) );
