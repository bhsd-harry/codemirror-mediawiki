/**
 * @typedef {object} Apos
 * @property {boolean} bold - apostrophe '''
 * @property {boolean} italic - apostrophe ''
 */

/**
 * @typedef {object} state
 * @property {token} tokenize - next token
 * @property {token[]} stack - ancestor tokens
 * @property {string[]} InHtmlTag - ancestor HTML tags
 * @property {Apos} apos - apostrophe states
 * @property {number} nTemplate - ancestor templates
 * @property {number} nLink - ancestor links
 * @property {number} nExt - ancestor parser functions
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
 * @typedef {function} eatFunc - not mutate state.tokenize and state.stack, can be a token itself
 * @returns {string|token} style or token
 */
/**
 * @typedef {function} inFunc - mutate state.tokenize and/or state.stack, can be a parser itself
 * @returns {string|true|[string, true]|parser} style or exit or parser (including token)
 */

/**
 * Basic rule: do not use function-scope variables
 */
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
			tr: true, noinclude: true, includeonly: true, onlyinclude: true, translate: true,
		},
		voidHtmlTags = { br: true, hr: true, wbr: true, img: true },
		nsFileRegex = getFileRegex();
	var span = typeof document === 'object' && document.createElement( 'span' ), // used for isEntity()
		mwConfig, urlProtocols, redirectRegex, imgKeyword;

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
	 * @returns {?string} style
	 * @todo deprecate endGround
	 */
	function makeStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		}
		const strong = state.apos.bold ? ' strong' : '',
			em = state.apos.italic ? ' em' : '';
		return makeLocalStyle( style + strong + em, state, endGround );
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
	 * greedy eat white spaces without returned styles
	 * This is not an eatFunc, despite its name
	 * @returns {string[]|false} result of RegExp match or false
	 */
	function eatSpace( stream ) {
		return stream.match( /^[\s\xa0]+/ );
	}

	/**
	 * eat until EOL
	 * @type {eatFunc}
	 * @param {string} name - token name
	 */
	function eatEnd( makeFunc, style, name ) {
		const tokenize = function ( stream, state ) {
			stream.skipToEnd();
			return makeFunc( style, state );
		};
		setName( tokenize, name );
		return tokenize;
	}

	/**
	 * eat until a specified terminator
	 * Can be multiline
	 * @type {eatFunc}
	 * @param {string} terminator - terminator string
	 * @param {string} name - token name
	 */
	function eatBlock( makeFunc, style, terminator, name ) {
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
			setName( stateObj.tokenize, name );
			return stateObj.tokenize( streamObj, stateObj );
		};
	}

	/**
	 * reset apostrophe states
	 */
	function clearApos( state ) {
		function clear( apos ) {
			Object.assign( apos, { bold: false, italic: false } );
		}
		clear( state.apos );
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
					if ( stream.match( '!--' ) ) { // 4. valid wikitext: <!--
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
	 * eat comment
	 * @type {token}
	 */
	function eatComment( stream, state ) {
		return eatBlock( makeLocalStyle, 'mw-comment', '-->', 'eatComment' )( stream, state );
	}

	function eatWikiTextOther() {
		/** @todo */
	}

	CodeMirror.defineMode( 'mediawiki', function ( config /* , parserConfig */ ) {
		mwConfig = config.mwConfig;
		urlProtocols = new RegExp( '^(?:' + mwConfig.urlProtocols + ')', 'i' );

		function eatChar( char, style ) {
			return function ( stream, state ) {
				state.tokenize = state.stack.pop();
				if ( stream.eat( char ) ) {
					return makeLocalStyle( style, state );
				}
				return makeLocalStyle( 'error', state );
			};
		}

		function eatSectionHeader( count ) {
			return function ( stream, state ) {
				if ( stream.match( /^[^&<[{~]+/ ) ) {
					if ( stream.eol() ) {
						stream.backUp( count );
						once( eatEnd( makeLocalStyle, 'mw-section-header', 'eatSectionHeaderEnd' ), state );
					}
					return null; // style is null
				}
				return eatWikiText( '' )( stream, state );
			};
		}

		function inVariable( stream, state ) {
			if ( stream.match( /^[^{}|]+/ ) ) {
				return makeLocalStyle( 'mw-templatevariable-name', state );
			}
			if ( stream.eat( '|' ) ) {
				state.tokenize = inVariableDefault;
				return makeLocalStyle( 'mw-templatevariable-delimiter', state );
			}
			if ( stream.match( '}}}' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-templatevariable-bracket', state );
			}
			if ( stream.match( '{{{' ) ) {
				state.stack.push( state.tokenize );
				return makeLocalStyle( 'mw-templatevariable-bracket', state );
			}
			stream.next();
			return makeLocalStyle( 'mw-templatevariable-name', state );
		}

		function inVariableDefault( stream, state ) {
			if ( stream.match( /^[^{}[<&~]+/ ) ) {
				return makeLocalStyle( 'mw-templatevariable', state );
			}
			if ( stream.match( '}}}' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-templatevariable-bracket', state );
			}
			return eatWikiText( 'mw-templatevariable' )( stream, state );
		}

		function inParserFunctionName( stream, state ) {
			if ( stream.match( /^#?[^:}{~]+/ ) ) { // FIXME: {{#name}} and {{uc}} are wrong, must have ':'
				return makeLocalStyle( 'mw-parserfunction-name', state );
			}
			if ( stream.eat( ':' ) ) {
				state.tokenize = inParserFunctionArguments;
				return makeLocalStyle( 'mw-parserfunction-delimiter', state );
			}
			if ( stream.match( '}}' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
			}
			return eatWikiText( 'mw-parserfunction' )( stream, state );
		}

		function inParserFunctionArguments( stream, state ) {
			if ( stream.match( /^[^|}{[<&~]+/ ) ) {
				return makeLocalStyle( 'mw-parserfunction', state );
			} else if ( stream.eat( '|' ) ) {
				return makeLocalStyle( 'mw-parserfunction-delimiter', state );
			} else if ( stream.match( '}}' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
			}
			return eatWikiText( 'mw-parserfunction' )( stream, state );
		}

		function eatTemplatePageName( haveEaten ) {
			return function ( stream, state ) {
				if ( stream.match( /^[\s\u00a0]*\|[\s\u00a0]*/ ) ) {
					state.tokenize = eatTemplateArgument( true );
					return makeLocalStyle( 'mw-template-delimiter', state );
				}
				if ( stream.match( /^[\s\u00a0]*\}\}/ ) ) {
					state.tokenize = state.stack.pop();
					return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
				}
				if ( stream.match( /^[\s\u00a0]*<!--.*?-->/ ) ) {
					return makeLocalStyle( 'mw-comment', state );
				}
				if ( haveEaten && stream.sol() ) {
					// @todo error message
					state.nTemplate--;
					state.tokenize = state.stack.pop();
					return;
				}
				if ( stream.match( /^[\s\u00a0]*[^\s\u00a0|}<{&~]+/ ) ) {
					state.tokenize = eatTemplatePageName( true );
					return makeLocalStyle( 'mw-template-name mw-pagename', state );
				} else if ( stream.eatSpace() ) {
					if ( stream.eol() === true ) {
						return makeLocalStyle( 'mw-template-name', state );
					}
					return makeLocalStyle( 'mw-template-name mw-pagename', state );
				}
				return eatWikiText( 'mw-template-name mw-pagename' )( stream, state );
			};
		}

		function eatTemplateArgument( expectArgName ) {
			return function ( stream, state ) {
				if ( expectArgName && stream.eatWhile( /[^=|}{[<&~]/ ) ) {
					if ( stream.eat( '=' ) ) {
						state.tokenize = eatTemplateArgument( false );
						return makeLocalStyle( 'mw-template-argument-name', state );
					}
					return makeLocalStyle( 'mw-template', state );
				} else if ( stream.eatWhile( /[^|}{[<&~]/ ) ) {
					return makeLocalStyle( 'mw-template', state );
				} else if ( stream.eat( '|' ) ) {
					state.tokenize = eatTemplateArgument( true );
					return makeLocalStyle( 'mw-template-delimiter', state );
				} else if ( stream.match( '}}' ) ) {
					state.tokenize = state.stack.pop();
					return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
				}
				return eatWikiText( 'mw-template' )( stream, state );
			};
		}

		function eatExternalLinkProtocol( chars ) {
			return function ( stream, state ) {
				while ( chars > 0 ) {
					chars--;
					stream.next();
				}
				if ( stream.eol() ) {
					state.nLink--;
					// @todo error message
					state.tokenize = state.stack.pop();
				} else {
					state.tokenize = inExternalLink;
				}
				return makeLocalStyle( 'mw-extlink-protocol', state );
			};
		}

		function inExternalLink( stream, state ) {
			if ( stream.sol() ) {
				state.nLink--;
				// @todo error message
				state.tokenize = state.stack.pop();
				return;
			}
			if ( stream.match( /^[\s\u00a0]*\]/ ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
			}
			if ( stream.eatSpace() ) {
				state.tokenize = inExternalLinkText;
				return makeStyle( '', state );
			}
			if ( stream.match( /^[^\s\u00a0\]{&~']+/ ) || stream.eatSpace() ) {
				if ( stream.peek() === '\'' ) {
					if ( stream.match( '\'\'', false ) ) {
						state.tokenize = inExternalLinkText;
					} else {
						stream.next();
					}
				}
				return makeStyle( 'mw-extlink', state );
			}
			return eatWikiText( 'mw-extlink' )( stream, state );
		}

		function inExternalLinkText( stream, state ) {
			if ( stream.sol() ) {
				state.nLink--;
				// @todo error message
				state.tokenize = state.stack.pop();
				return;
			}
			if ( stream.eat( ']' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
			}
			if ( stream.match( /^[^'\]{&~]+/ ) ) {
				return makeStyle( 'mw-extlink-text', state );
			}
			return eatWikiText( 'mw-extlink-text' )( stream, state );
		}

		function inLink( stream, state ) {
			if ( stream.sol() ) {
				state.nLink--;
				// @todo error message
				state.tokenize = state.stack.pop();
				return;
			}
			if ( stream.match( /^[\s\u00a0]*#[\s\u00a0]*/ ) ) {
				state.tokenize = inLinkToSection;
				return makeLocalStyle( 'mw-link', state );
			}
			if ( stream.match( /^[\s\u00a0]*\|[\s\u00a0]*/ ) ) {
				state.tokenize = eatLinkText();
				return makeLocalStyle( 'mw-link-delimiter', state );
			}
			if ( stream.match( /^[\s\u00a0]*\]\]/ ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
				/*
				 * if ( !stream.eatSpace() ) {
				 * state.ImInBlock.push( 'LinkTrail' );
				 * }
				 */
			}
			if ( stream.match( /^[\s\u00a0]*[^\s\u00a0#|\]&~{]+/ ) || stream.eatSpace() ) { // FIXME '{{' brokes Link, sample [[z{{page]]
				return makeStyle( 'mw-link-pagename mw-pagename', state );
			}
			return eatWikiText( 'mw-link-pagename mw-pagename' )( stream, state );
		}

		function inLinkToSection( stream, state ) {
			if ( stream.sol() ) {
				// @todo error message
				state.nLink--;
				state.tokenize = state.stack.pop();
				return;
			}
			if ( stream.match( /^[^|\]&~{}]+/ ) ) { // FIXME '{{' brokes Link, sample [[z{{page]]
				return makeLocalStyle( 'mw-link-tosection', state );
			}
			if ( stream.eat( '|' ) ) {
				state.tokenize = eatLinkText();
				return makeLocalStyle( 'mw-link-delimiter', state );
			}
			if ( stream.match( ']]' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
				/*
				 * if ( !stream.eatSpace() ) {
				 * state.ImInBlock.push( 'LinkTrail' );
				 * }
				 */
			}
			return eatWikiText( 'mw-link-tosection' )( stream, state );
		}

		function eatLinkText() {
			var linkIsBold, linkIsItalic;
			return function ( stream, state ) {
				var tmpstyle;
				if ( stream.match( ']]' ) ) {
					state.tokenize = state.stack.pop();
					return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
				}
				if ( stream.match( '\'\'\'' ) ) {
					linkIsBold = !linkIsBold;
					return makeLocalStyle( 'mw-link-text mw-apostrophes', state );
				}
				if ( stream.match( '\'\'' ) ) {
					linkIsItalic = !linkIsItalic;
					return makeLocalStyle( 'mw-link-text mw-apostrophes', state );
				}
				tmpstyle = 'mw-link-text';
				if ( linkIsBold ) {
					tmpstyle += ' strong';
				}
				if ( linkIsItalic ) {
					tmpstyle += ' em';
				}
				if ( stream.match( /^[^'\]{&~]+/ ) ) {
					return makeStyle( tmpstyle, state );
				}
				return eatWikiText( tmpstyle )( stream, state );
			};
		}

		function eatTagName( chars, isCloseTag, isHtmlTag ) {
			return function ( stream, state ) {
				var name = '';
				while ( chars > 0 ) {
					chars--;
					name += stream.next();
				}
				if ( stream.eol() ) {
					// @todo error message
					state.tokenize = state.stack.pop();
					return makeLocalStyle( isHtmlTag ? 'mw-htmltag-name' : 'mw-exttag-name', state );
				}
				stream.eatSpace();
				if ( stream.eol() ) {
					// @todo error message
					state.tokenize = state.stack.pop();
					return makeLocalStyle( isHtmlTag ? 'mw-htmltag-name' : 'mw-exttag-name', state );
				}

				if ( isHtmlTag ) {
					if ( isCloseTag && !( name in voidHtmlTags ) ) {
						state.tokenize = eatChar( '>', 'mw-htmltag-bracket' );
					} else {
						state.tokenize = eatHtmlTagAttribute( name );
					}
					return makeLocalStyle( 'mw-htmltag-name', state );
				} // it is the extension tag
				if ( isCloseTag ) {
					state.tokenize = eatChar( '>', 'mw-exttag-bracket mw-ext-' + name );
				} else {
					state.tokenize = eatExtTagAttribute( name );
				}
				return makeLocalStyle( 'mw-exttag-name mw-ext-' + name, state );
			};
		}

		function eatHtmlTagAttribute( name ) {
			return function ( stream, state ) {
				if ( stream.match( /^(?:"[^"]*"|'[^']*'|[^>/<{&~])+/ ) ) {
					return makeLocalStyle( 'mw-htmltag-attribute', state );
				}
				if ( stream.eat( '>' ) ) {
					if ( !( name in voidHtmlTags ) ) {
						state.InHtmlTag.push( name );
					}
					state.tokenize = state.stack.pop();
					return makeLocalStyle( 'mw-htmltag-bracket', state );
				}
				if ( stream.match( '/>' ) ) {
					state.tokenize = state.stack.pop();
					return makeLocalStyle( 'mw-htmltag-bracket', state );
				}
				return eatWikiText( 'mw-htmltag-attribute' )( stream, state );
			};
		}

		function eatExtTagAttribute( name ) {
			return function ( stream, state ) {
				if ( stream.match( /^(?:"[^"]*"|'[^']*'|[^>/<{&~])+/ ) ) {
					return makeLocalStyle( 'mw-exttag-attribute mw-ext-' + name, state );
				}
				if ( stream.eat( '>' ) ) {
					state.extName = name;
					if ( name in mwConfig.tagModes ) {
						state.extMode = CodeMirror.getMode( config, mwConfig.tagModes[ name ] );
						state.extState = CodeMirror.startState( state.extMode );
					}
					state.tokenize = eatExtTagArea( name );
					return makeLocalStyle( 'mw-exttag-bracket mw-ext-' + name, state );
				}
				if ( stream.match( '/>' ) ) {
					state.tokenize = state.stack.pop();
					return makeLocalStyle( 'mw-exttag-bracket mw-ext-' + name, state );
				}
				return eatWikiText( 'mw-exttag-attribute mw-ext-' + name )( stream, state );
			};
		}

		function eatExtTagArea( name ) {
			return function ( stream, state ) {
				var origString = false,
					from = stream.pos,
					to,
					pattern = new RegExp( '</' + name + '\\s*>', 'i' ),
					m = pattern.exec( from ? stream.string.slice( from ) : stream.string );

				if ( m ) {
					if ( m.index === 0 ) {
						state.tokenize = eatExtCloseTag( name );
						state.extName = false;
						if ( state.extMode !== false ) {
							state.extMode = false;
							state.extState = false;
						}
						return state.tokenize( stream, state );
					}
					to = m.index + from;
					origString = stream.string;
					stream.string = origString.slice( 0, to );
				}

				state.stack.push( state.tokenize );
				state.tokenize = eatExtTokens( origString );
				return state.tokenize( stream, state );
			};
		}

		function eatExtCloseTag( name ) {
			return function ( stream, state ) {
				stream.next(); // eat <
				stream.next(); // eat /
				state.tokenize = eatTagName( name.length, true, false );
				return makeLocalStyle( 'mw-exttag-bracket mw-ext-' + name, state );
			};
		}

		function eatExtTokens( origString ) {
			return function ( stream, state ) {
				var ret;
				if ( state.extMode === false ) {
					ret = origString === false && stream.sol() ? 'line-cm-mw-exttag' : 'mw-exttag';
					stream.skipToEnd();
				} else {
					ret = ( origString === false && stream.sol() ? 'line-cm-mw-tag-' : 'mw-tag-' ) + state.extName;
					ret += ' ' + state.extMode.token( stream, state.extState, origString === false );
				}
				if ( stream.eol() ) {
					if ( origString !== false ) {
						stream.string = origString;
					}
					state.tokenize = state.stack.pop();
				}
				return makeLocalStyle( ret, state );
			};
		}

		function eatStartTable( stream, state ) {
			stream.match( '{|' );
			stream.eatSpace();
			state.tokenize = inTableDefinition;
			return 'mw-table-bracket';
		}

		function inTableDefinition( stream, state ) {
			if ( stream.sol() ) {
				state.tokenize = inTable;
				return inTable( stream, state );
			}
			return eatWikiText( 'mw-table-definition' )( stream, state );
		}

		function inTableCaption( stream, state ) {
			if ( stream.sol() && stream.match( /^[\s\u00a0]*[|!]/, false ) ) {
				state.tokenize = inTable;
				return inTable( stream, state );
			}
			return eatWikiText( 'mw-table-caption' )( stream, state );
		}

		function inTable( stream, state ) {
			if ( stream.sol() ) {
				stream.eatSpace();
				if ( stream.eat( '|' ) ) {
					if ( stream.eat( '-' ) ) {
						stream.eatSpace();
						state.tokenize = inTableDefinition;
						return makeLocalStyle( 'mw-table-delimiter', state );
					}
					if ( stream.eat( '+' ) ) {
						stream.eatSpace();
						state.tokenize = inTableCaption;
						return makeLocalStyle( 'mw-table-delimiter', state );
					}
					if ( stream.eat( '}' ) ) {
						state.tokenize = state.stack.pop();
						return makeLocalStyle( 'mw-table-bracket', state );
					}
					stream.eatSpace();
					state.tokenize = eatTableRow( true, false );
					return makeLocalStyle( 'mw-table-delimiter', state );
				}
				if ( stream.eat( '!' ) ) {
					stream.eatSpace();
					state.tokenize = eatTableRow( true, true );
					return makeLocalStyle( 'mw-table-delimiter', state );
				}
			}
			return eatWikiText( '' )( stream, state );
		}

		function eatTableRow( isStart, isHead ) {
			return function ( stream, state ) {
				if ( stream.sol() ) {
					if ( stream.match( /^[\s\u00a0]*[|!]/, false ) ) {
						state.tokenize = inTable;
						return inTable( stream, state );
					}
				} else {
					if ( stream.match( /^[^'|{[<&~!]+/ ) ) {
						return makeStyle( isHead ? 'strong' : '', state );
					}
					if ( stream.match( '||' ) || isHead && stream.match( '!!' ) || isStart && stream.eat( '|' ) ) {
						state.apos.bold = false;
						state.apos.italic = false;
						if ( isStart ) {
							state.tokenize = eatTableRow( false, isHead );
						}
						return makeLocalStyle( 'mw-table-delimiter', state );
					}
				}
				return eatWikiText( isHead ? 'strong' : '' )( stream, state );
			};
		}

		function eatFreeExternalLinkProtocol( stream, state ) {
			stream.match( urlProtocols );
			state.tokenize = eatFreeExternalLink;
			return makeLocalStyle( 'mw-free-extlink-protocol', state );
		}

		function eatFreeExternalLink( stream, state ) {
			if ( stream.eol() ) {
				// @todo error message
			} else if ( stream.match( /^[^\s\u00a0{[\]<>~).,']*/ ) ) {
				if ( stream.peek() === '~' ) {
					if ( !stream.match( /^~{3,}/, false ) ) {
						stream.match( /^~*/ );
						return makeLocalStyle( 'mw-free-extlink', state );
					}
				} else if ( stream.peek() === '{' ) {
					if ( !stream.match( /^\{\{/, false ) ) {
						stream.next();
						return makeLocalStyle( 'mw-free-extlink', state );
					}
				} else if ( stream.peek() === '\'' ) {
					if ( !stream.match( '\'\'', false ) ) {
						stream.next();
						return makeLocalStyle( 'mw-free-extlink', state );
					}
				} else if ( stream.match( /^[).,]+(?=[^\s\u00a0{[\]<>~).,])/ ) ) {
					return makeLocalStyle( 'mw-free-extlink', state );
				}
			}
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-free-extlink', state );
		}

		function eatWikiText( style, mnemonicStyle ) {
			return function ( stream, state ) {
				var ch, tmp, mt, name, isCloseTag, tagname,
					sol = stream.sol();

				if ( sol ) {
					if ( !stream.match( '//', false ) && stream.match( urlProtocols ) ) { // highlight free external links, bug T108448
						state.stack.push( state.tokenize );
						state.tokenize = eatFreeExternalLink;
						return makeLocalStyle( 'mw-free-extlink-protocol', state );
					}
					ch = stream.next();
					switch ( ch ) {
						case '-':
							if ( stream.match( /^----*/ ) ) {
								return 'mw-hr';
							}
							break;
						case '=':
							tmp = stream.match( /^(={0,5})(.+?(=\1\s*))$/ );
							if ( tmp ) { // Title
								stream.backUp( tmp[ 2 ].length );
								state.stack.push( state.tokenize );
								state.tokenize = eatSectionHeader( tmp[ 3 ].length );
								return 'mw-section-header line-cm-mw-section-' + ( tmp[ 1 ].length + 1 );
							}
							break;
						case '*':
						case '#':
							if ( stream.match( /^[*#]*:*/ ) ) {
								return 'mw-list';
							}
							break;
						case ':':
							if ( stream.match( /^:*{\|/, false ) ) { // Highlight indented tables :{|, bug T108454
								state.stack.push( state.tokenize );
								state.tokenize = eatStartTable;
							}
							if ( stream.match( /^:*[*#]*/ ) ) {
								return 'mw-list';
							}
							break;
						case ' ':
							if ( stream.match( /^[\s\u00a0]*:*{\|/, false ) ) { // Leading spaces is the correct syntax for a table, bug T108454
								stream.eatSpace();
								if ( stream.match( /^:+/ ) ) { // ::{|
									state.stack.push( state.tokenize );
									state.tokenize = eatStartTable;
									return 'mw-list';
								}
								stream.eat( '{' );
							} else {
								return 'mw-skipformatting';
							}
							/*
							 * break is not necessary here
							 * falls through
							 */
						case '{':
							if ( stream.eat( '|' ) ) {
								stream.eatSpace();
								state.stack.push( state.tokenize );
								state.tokenize = inTableDefinition;
								return 'mw-table-bracket';
							}
					}
				} else {
					ch = stream.next();
				}

				switch ( ch ) {
					case '&':
						return makeStyle( eatMnemonic( stream, style || '', mnemonicStyle ), state );
					case "'": {
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
						return makeStyle( style, state );
					}
					case '[':
						if ( stream.eat( '[' ) ) { // Link Example: [[ Foo | Bar ]]
							stream.eatSpace();
							if ( /[^\]|[]/.test( stream.peek() ) ) {
								state.nLink++;
								state.stack.push( state.tokenize );
								state.tokenize = inLink;
								return makeLocalStyle( 'mw-link-bracket', state );
							}
						} else {
							mt = stream.match( urlProtocols );
							if ( mt ) {
								state.nLink++;
								stream.backUp( mt[ 0 ].length );
								state.stack.push( state.tokenize );
								state.tokenize = eatExternalLinkProtocol( mt[ 0 ].length );
								return makeLocalStyle( 'mw-extlink-bracket', state );
							}
						}
						break;
					case '{':
						if ( !stream.match( '{{{{', false ) && stream.match( '{{' ) ) { // Template parameter (skip parameters inside a template transclusion, Bug: T108450)
							stream.eatSpace();
							state.stack.push( state.tokenize );
							state.tokenize = inVariable;
							return makeLocalStyle( 'mw-templatevariable-bracket', state );
						} else if ( stream.match( /^\{[\s\u00a0]*/ ) ) {
							if ( stream.peek() === '#' ) { // Parser function
								state.nExt++;
								state.stack.push( state.tokenize );
								state.tokenize = inParserFunctionName;
								return makeLocalStyle( 'mw-parserfunction-bracket', state );
							}
							// Check for parser function without '#'
							name = stream.match( /^([^\s\u00a0}[\]<{'|&:]+)(:|[\s\u00a0]*)(\}\}?)?(.)?/ );
							if ( name ) {
								stream.backUp( name[ 0 ].length );
								if ( ( name[ 2 ] === ':' || name[ 4 ] === undefined || name[ 3 ] === '}}' ) && ( name[ 1 ].toLowerCase() in mwConfig.functionSynonyms[ 0 ] || name[ 1 ] in mwConfig.functionSynonyms[ 1 ] ) ) {
									state.nExt++;
									state.stack.push( state.tokenize );
									state.tokenize = inParserFunctionName;
									return makeLocalStyle( 'mw-parserfunction-bracket', state );
								}
							}
							// Template
							state.nTemplate++;
							state.stack.push( state.tokenize );
							state.tokenize = eatTemplatePageName( false );
							return makeLocalStyle( 'mw-template-bracket', state );
						}
						break;
					case '<':
						isCloseTag = Boolean( stream.eat( '/' ) );
						tagname = stream.match( /^[^>/\s\u00a0.*,[\]{}$^+?|/\\'`~<=!@#%&()-]+/ );
						if ( stream.match( '!--' ) ) { // comment
							return eatComment( stream, state );
						}
						if ( tagname ) {
							tagname = tagname[ 0 ].toLowerCase();
							if ( tagname in mwConfig.tags ) { // Parser function
								if ( isCloseTag === true ) {
									// @todo message
									return 'error';
								}
								stream.backUp( tagname.length );
								state.stack.push( state.tokenize );
								state.tokenize = eatTagName( tagname.length, isCloseTag, false );
								return makeLocalStyle( 'mw-exttag-bracket mw-ext-' + tagname, state );
							}
							if ( tagname in permittedHtmlTags ) { // Html tag
								if ( isCloseTag === true && tagname !== state.InHtmlTag.pop() ) {
									// @todo message
									return 'error';
								}
								if ( isCloseTag === true && tagname in voidHtmlTags ) {
									// @todo message
									return 'error';
								}
								stream.backUp( tagname.length );
								state.stack.push( state.tokenize );
								// || ( tagname in voidHtmlTags ) because opening void tags should also be treated as the closing tag.
								state.tokenize = eatTagName( tagname.length, isCloseTag || tagname in voidHtmlTags, true );
								return makeLocalStyle( 'mw-htmltag-bracket', state );
							}
							stream.backUp( tagname.length );
						}
						break;
					case '~':
						if ( stream.match( /^~{2,4}/ ) ) {
							return 'mw-signature';
						}
						break;
					case '_': // Maybe double undescored Magic Word as __TOC__
						tmp = 1;
						while ( stream.eat( '_' ) ) { // Optimize processing of many underscore symbols
							tmp++;
						}
						if ( tmp > 2 ) { // Many underscore symbols
							if ( !stream.eol() ) {
								stream.backUp( 2 ); // Leave last two underscore symbols for processing again in next iteration
							}
							return makeStyle( style, state ); // Optimization: skip regex function at the end for EOL and backuped symbols
						} else if ( tmp === 2 ) { // Check on double underscore Magic Word
							name = stream.match( /^([^\s\u00a0>}[\]<{'|&:~]+?)__/ ); // The same as the end of function except '_' inside and with '__' at the end of string
							if ( name && name[ 0 ] ) {
								if ( '__' + name[ 0 ].toLowerCase() in mwConfig.doubleUnderscore[ 0 ] || '__' + name[ 0 ] in mwConfig.doubleUnderscore[ 1 ] ) {
									return 'mw-doubleUnderscore';
								}
								if ( !stream.eol() ) {
									stream.backUp( 2 ); // Two underscore symbols at the end can be begining of other double undescored Magic Word
								}
								return makeStyle( style, state ); // Optimization: skip regex function at the end for EOL and backuped symbols
							}
						}
						break;
					default:
						if ( /[\s\u00a0]/.test( ch ) ) {
							stream.eatSpace();
							if ( stream.match( urlProtocols, false ) && !stream.match( '//' ) ) { // highlight free external links, bug T108448
								state.stack.push( state.tokenize );
								state.tokenize = eatFreeExternalLinkProtocol;
								return makeStyle( style, state );
							}
						}
						break;
				}
				stream.match( /^[^\s\u00a0_>}[\]<{'|&:~]+/ );
				return makeStyle( style, state );
			};
		}

		return {
			startState: function () {
				return {
					tokenize: eatWikiText( '' ),
					stack: [], InHtmlTag: [], errors: [],
					apos: {},
					extName: false, extMode: false, extState: false,
					nTemplate: 0, nLink: 0, nExt: 0,
				};
			},
			copyState: function ( state ) {
				return {
					tokenize: state.tokenize,
					stack: state.stack.concat( [] ),
					InHtmlTag: state.InHtmlTag.concat( [] ),
					errors: state.errors.concat( [] ),
					apos: Object.assign( {}, state.apos ),
					extName: state.extName,
					extMode: state.extMode,
					extState: state.extMode !== false && CodeMirror.copyState( state.extMode, state.extState ),
					nTemplate: state.nTemplate,
					nLink: state.nLink,
					nExt: state.nExt,
				};
			},
			token: function ( stream, state ) {
				if ( stream.sol() ) { // reset bold and italic status in every new line
					clearApos( state );
				}
				return state.tokenize( stream, state );
			},
			blankLine: function ( state ) {
				var ret;
				if ( state.extName ) {
					if ( state.extMode ) {
						ret = '';
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

	function eatNowiki( style, lineStyle ) {
		return function ( stream, state, ownLine ) {
			var s;
			if ( ownLine && stream.sol() ) {
				state.ownLine = true;
			} else if ( ownLine === false && state.ownLine ) {
				state.ownLine = false;
			}
			s = state.ownLine ? lineStyle : style;
			if ( stream.match( /^[^&]+/ ) ) {
				return s;
			}
			stream.next(); // eat &
			return eatMnemonic( stream, s );
		};
	}

	CodeMirror.defineMode( 'mw-tag-pre', function ( /* config, parserConfig */ ) {
		return {
			startState: function () {
				return {};
			},
			token: eatNowiki( 'mw-tag-pre', 'line-cm-mw-tag-pre' ),
		};
	} );

	CodeMirror.defineMode( 'mw-tag-nowiki', function ( /* config, parserConfig */ ) {
		return {
			startState: function () {
				return {};
			},
			token: eatNowiki( 'mw-tag-nowiki', 'line-cm-mw-tag-nowiki' ),
		};
	} );
}( CodeMirror ) );
