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
		nsFileRegex = getFileRegex(),
		errorMsgs = {
			'invalid-char-pagename': '页面名称出现无效字符"$1"。',
			'invalid-char-link-section': '章节链接出现无效字符"$1"。',
			'link-in-link': '$1部链接中不应包含内部链接。',
			'sign-in-link': '$1部链接中不应包含签名。',
			'sign-pagename': '页面名称不应包含签名。',
			'tag-in-link-section': '章节链接中不应包含$1标签。',
			'link-text-redirect': '重定向不应包含链接文字。'
		};
	var span, mwConfig, urlProtocols, redirectRegex, imgKeyword;
	if ( typeof document === 'object' ) {
		span = document.createElement( 'span' ); // used for isEntity()
	}

	/**
	 * create RegExp for file links
	 * @returns {RegExp}
	 */
	function getFileRegex() {
		const nsIds = typeof mw === 'object'
				? mw.config.get( 'wgNamespaceIds' )
				: { file: 6, image: 6, 图像: 6, 圖像: 6, 档案: 6, 檔案: 6, 文件: 6 },
			nsFile = Object.keys( nsIds ).filter( function ( ns ) {
				return nsIds[ ns ] === 6;
			} ).join( '|' );
		return new RegExp( '^([\\s\\xa0]*)((?:' + nsFile + ')[\\s\\xa0]*:[\\s\\xa0]*)', 'i' );
	}

	/**
	 * update state.errors by adding new error message
	 * @param {string} key - error message key
	 * @param {?string} arg - additional argument to replace $1 in message templates
	 * @returns {undefined}
	 */
	function newError( state, key, arg ) {
		if ( typeof global === 'object' ) {
			const msg = errorMsgs[ key ];
			state.errors.push( arg === undefined ? msg : msg.replace( '$1', arg ) );
		}
	}

	/**
	 * escape string before creating RegExp
	 * @param {string} str
	 * @returns {string}
	 */
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
	 * - template argument name
	 * - template variable name
	 * - internal link pagename if there is link text
	 * - file link pagename
	 * - file link keyword
	 * - external link
	 * - tag attribute
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
			italic: state.apos.italic || state.parentApos.italic,
			dt: state.apos.dt || state.parentApos.dt,
			th: state.apos.th || state.parentApos.th
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
	 * WARNING: This function mutates state.stack
	 * @param {(string|true|Array)} result - return of an inFunc
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
	 * @param {eatFunc} parser - token
	 * @param {?Array.<string>} ground - properties of stateObj to increment
	 * @param {?Array.<string>} endGround - properties of stateObj to decrement when exiting
	 * @returns {undefined}
	 */
	function once( parser, stateObj, ground, endGround ) {
		stateObj.stack.push( stateObj.tokenize );
		stateObj.tokenize = function ( stream, state ) {
			state.tokenize = state.stack.pop();
			increment( state, ground );
			const style = parser( stream, state );
			increment( state, endGround, -1 );
			return style;
		};
	}

	/**
	 * execute token until exit
	 * WARNING: This function may only increments state object properties but not decrement
	 * @param {inFunc} parser - token
	 * @param {?Array.<string>} ground - properties of stateObj to increment
	 * @param {?Array.<string>} endGround - properties of stateObj to decrement when exiting
	 * @returns {undefined}
	 */
	function chain( parser, stateObj, ground, endGround ) {
		stateObj.stack.push( stateObj.tokenize );
		stateObj.tokenize = function ( stream, state ) {
			increment( state, ground );
			state.tokenize = token;
		};
		function token( stream, state ) {
			try {
				return handleExit( parser( stream, state ), state, endGround );
			} catch ( e ) {
				return e;
			}
		}
	}

	/**
	 * chain token with a mutable option object
	 * WARNING: This function may only increments state object properties but not decrement
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
			Object.defineProperty( updateToken, 'name', { value: name } );
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
		return sectionHeader;
		function sectionHeader( stream, state ) {
			if ( stream.sol() ) { // 1. SOL
				return true;
			} else if ( stream.match( /^[^{&'~[<_]+/ ) ) { // 2. plain text
				if ( stream.eol() ) { // 1. EOL
					stream.backUp( count );
					once( eatEnd( makeLocalStyle, 'mw-section-header' ), state );
				}
				return makeFunc( '', state );
			}
			return eatWikiTextOther( makeFunc, '' )( stream, state ); // 4. common wikitext
		}
	}

	/**
	 * eat comment
	 */
	function eatComment( stream, state ) {
		return eatBlock( makeLocalStyle, 'mw-comment', '-->' )( stream, state );
	}

	/**
	 * external link after protocol
	 * @param {Object} option
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
					// @todo error message
					state.nLink--;
					return true;
				} else if ( stream.eat( ']' ) ) { // 3. unique syntax: ]
					return [ makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' ), true ];
				}
				chain( inExternalLinkText, state );
				return;
			} else if ( stream.sol() ) { // 1. SOL
				// @todo error message
				state.nLink--;
				state.nInvisible--;
				return true;
			}
			const ch = stream.next();
			switch ( ch ) {
				case ']': // 3. unique syntax: ]
					state.nInvisible--;
					return [ makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' ), true ];
				case '[': // 3. unique syntax: [
					changeToText();
					if ( stream.eat( '[' ) ) {
						newError( state, 'link-in-link', '外' );
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
						newError( state, 'sign-in-link', '外' );
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
			const ch = stream.next();
			switch ( ch ) {
				case '[': // 4. invalid wikitext: [
					if ( stream.eat( '[' ) ) {
						newError( state, 'link-in-link', '外' );
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
							newError( state, 'sign-in-link', '外' );
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
	 */
	function inFileLink() {
		return fileLink;

		/**
		 * Cannot be multiline
		 * Unique syntax: |, ]]
		 */
		function fileLink( stream, state ) {
			if ( stream.sol() ) { // 1. SOL
				state.nLink--;
				// @todo error message
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return;
			} else if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
				if ( state.nLink === 1 ) {
					state.parentApos = state.apos;
					state.aposStack.push( state.apos );
					state.apos = {};
				}
				state.tokenize = inFileLinkText;
				state.nInvisible--;
				return makeLocalStyle( 'mw-link-delimiter', state );
			} else if ( stream.match( /^[\s\xa0]*]]/ ) ) { // 3. unique syntax: ]]
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			}
			// 2. plain text; 4. common wikitext; 5. fallback
			return eatPageName( /^[^\s\xa0|}&#<~>[\]{]+/, makeLocalStyle, 'mw-link-pagename', {
				haveEaten: true,
				ampStyle: 'error'
			} )( stream, state );
		}

		/**
		 * file link text
		 * Can be multiline
		 * Not differentiating parameters, so can be wrong
		 * Unique syntax: |, ]], =
		 * Invalid wikitext syntax: *, #, :, ;, SPACE
		 */
		function inFileLinkText( stream, state ) {
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
				if ( option.invisible ) {
					state.nInvisible--;
				}
				state.nLink--;
				return true;
			}
			const mt = stream.match( /^[\s\xa0]*([#|]|]]|{{[\s\xa0]*![\s\xa0]*}})/ );
			if ( mt ) {
				switch ( mt[ 1 ] ) {
					case '#': // 3. unique syntax: #
						chain( inLinkToSection( option ), state );
						return makeFunc( 'mw-link', state );
					case ']]': // 3. unique syntax: ]]
						if ( option.invisible ) {
							state.nInvisible--;
						}
						return [ makeLocalStyle( 'mw-link-bracket', state, 'nLink' ), true ];
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
					// @todo error message
					return true;
				}
				const ch = stream.next();
				switch ( ch ) {
					case ']':
						if ( stream.peek() !== ']' ) { // 3. invalid character: ]
							newError( state, 'invalid-char-link-section', ']' );
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
							newError( state, 'tag-in-link-section', 'HTML' );
							return makeFunc( 'error', state );
						} else if ( name in mwConfig.tags && !mt[ 1 ] ) {
							newError( state, 'tag-in-link-section', '扩展' );
							return makeFunc( 'error', state );
						}
						break;
					}
					case '~':
						if ( stream.match( /^~{2,4}/ ) ) { // 4. invalid wikitext: ~~~
							newError( 'sign-in-link', '内' );
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
				if ( stream.sol() ) { // SOL
					switch ( ch ) {
						case ' ':
						case ':':
						case '{':
							if ( !stream.match( /^[\s\xa0]*:*[\s\xa0]*{\|/, false ) ) {
								break;
							}
							// fall through
						case '-': // 4. valid wikitext: ----, =, {|
						case '=':
							if ( redirect ) {
								newError( state, 'link-text-redirect' );
							}
							return eatWikiTextSol( makeFunc, style )( stream, state );
					}
				}
				stream.next();
				switch ( ch ) {
					case '{': // 4. valid wikitext: {{, {{{, &, '', <
					case '&':
					case "'":
					case '<':
						stream.backUp( 1 );
						if ( redirect ) {
							newError( state, 'link-text-redirect' );
						}
						return eatWikiTextOther( makeFunc, style )( stream, state );
					case ']':
						if ( stream.peek() === ']' ) { // 3. unique syntax: ]]
							stream.backUp( 1 );
							if ( state.nLink === 1 ) {
								state.apos = state.aposStack.pop();
								state.parentApos = {};
							}
							return true;
						}
						break;
					case '[':
						if ( stream.eat( '[' ) ) { // 4. invalid wikitext: [[
							newError( state, 'link-in-link', '内' );
							return makeFunc( 'error', state );
						}
						break;
					case '~':
						if ( stream.match( /^~{2,3}/ ) ) {
							if ( stream.eat( '~' ) ) { // 4. valid wikitext: ~~~~~
								return 'mw-signature'; // has own background
							}
							newError( state, 'sign-in-link', '内' );
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
			switch ( ch ) {
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
					if ( state.nInvisible ) {
						fallbackStyle = style || '';
						break;
					}
					stream.backUp( 1 );
					if ( stream.match( redirectRegex ) ) {
						update( inLink, state, { redirect: true }, 'nInvisible', 'nInvisible' );
						once( eatChars( 2, makeLocalStyle, 'mw-link-bracket' ), state, 'nLink' );
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
						state.apos.dt = true;
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
						state.apos.dt = true;
					}
					return makeLocalStyle( 'mw-list', state );
				}
				case ' ': {
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
	 * @returns {?string}
	 */
	function eatWikiTextOther( makeFunc, style, details ) {
		return function ( stream, state ) {
			details = details || {}; // eslint-disable-line no-param-reassign
			const ch = stream.next();
			var errorStyle, mt;
			switch ( ch ) {
				case '&': // valid wikitext: &
					return makeFunc( eatMnemonic( stream, style || '', details.amp ), state );
				case "'":
					if ( state.nInvisible === 0 ) {
						mt = stream.match( /^'*/ );
						const chars = mt[ 0 ].length;
						switch ( chars ) {
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
					if ( !mt || stream.eol() ) {
						// fallback
					} else {
						stream.backUp( 2 );
						once( eatDoubleUnderscore( makeFunc, errorStyle ), state );
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
							chain( inFileLink(), state, 'nInvisible', 'nInvisible' );
							once( eatChars( mt[ 2 ].length, makeLocalStyle, 'mw-link-pagename mw-pagename' ), state );
							once( eatChars( mt[ 1 ].length, makeLocalStyle, 'mw-link-pagename' ), state );
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
						once( eatChars( mt[ 0 ].length, makeLocalStyle, 'mw-extlink-protocol' ), state );
						return makeLocalStyle( 'mw-extlink-bracket', state );
					}
					break;
				case '{':
					errorStyle = details.lbrace === undefined ? style || '' : details.lbrace;
					break;
				case '<':
					if ( stream.match( '!--' ) ) { // valid wikitext: <!--
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
		mwConfig = config.mwConfig;
		mwConfig.redirect = mwConfig.redirect || [ '#REDIRECT' ];
		mwConfig.img = mwConfig.img || {};
		urlProtocols = new RegExp( '^(?:' + mwConfig.urlProtocols + ')', 'i' );
		redirectRegex = new RegExp( '^[\\s\\xa0]*(?:' + mwConfig.redirect.map( function ( word ) {
			return escapeRegExp( word );
		} ).join( '|' ) + ')[\\s\\xa0]*:?[\\s\\xa0]*(?=\\[\\[|\\[?$)', 'i' );
		imgKeyword = new RegExp( '^[\\s\\xa0]*(?:' + Object.keys( mwConfig.img ).map( function ( word ) {
			return escapeRegExp( word ).replace( '\\$1', '[^|\\]]*' );
		} ).join( '|' ) + ')' );

		return {
			startState: function () {
				return {
					tokenize: eatWikiText( '' ),
					stack: [], InHtmlTag: [], errors: [],
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
					errors: state.errors.concat( [] ),
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
