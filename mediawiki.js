( function ( CodeMirror ) {
	'use strict';

	const permittedHtmlTags = new Set( [
			'b', 'bdi', 'bdo', 'del', 'i', 'ins', 'img', 'u', 'font', 'big', 'small', 'sub', 'sup', 'h1', 'h2', 'h3',
			'h4', 'h5', 'h6', 'cite', 'code', 'em', 's', 'strike', 'strong', 'tt', 'var', 'div', 'center', 'blockquote',
			'q', 'ol', 'ul', 'dl', 'table', 'caption', 'pre', 'ruby', 'rb', 'rp', 'rt', 'rtc', 'p', 'span', 'abbr',
			'dfn', 'kbd', 'samp', 'data', 'time', 'mark', 'br', 'wbr', 'hr', 'li', 'dt', 'dd', 'td', 'th', 'tr',
			'noinclude', 'includeonly', 'onlyinclude', 'translate'
		] ),
		voidHtmlTags = new Set( [ 'br', 'hr', 'wbr', 'img' ] ),
		span = typeof document === 'object' && document.createElement( 'span' ); // used for isEntity()
	let mwConfig, urlProtocols;

	/**
	 * add background
	 */
	function makeLocalStyle( style, state, endGround ) {
		let ground = '';
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
		if ( state.nLink > 0 ) {
			ground += '-link';
		}
		if ( endGround ) {
			state[ endGround ]--;
		}
		return style + ( ground && ` mw${ ground }-ground` );
	}

	function makeStyle( style, state, endGround ) {
		return makeLocalStyle( style + ( state.isBold ? ' strong' : '' ), state, endGround );
	}

	function isEntity( str ) {
		if ( !span ) {
			return true;
		}
		span.innerHTML = str;
		return span.textContent.length === 1;
	}

	/**
	 * simply eat HTML entities
	 */
	function eatMnemonic( stream, style ) {
		// no dangerous character should appear in results
		const entity = stream.match( /^(?:#x[a-f\d]+|#\d+|[a-z\d]+);/i );
		return entity && isEntity( `&${ entity[ 0 ] }` ) ? `${ style } mw-mnemonic` : style;
	}

	/**
	 * simply eat until a block ends with specified terminator
	 */
	function eatBlock( style, terminator ) {
		return function ( stream, state ) {
			if ( !stream.skipTo( terminator ) ) {
				stream.skipToEnd();
			} else {
				stream.match( terminator );
				state.tokenize = state.stack.pop();
			}
			return makeLocalStyle( style, state );
		};
	}

	/**
	 * simply eat until the end of line
	 */
	function eatEnd( style ) {
		return function ( stream, state ) {
			stream.skipToEnd();
			state.tokenize = state.stack.pop();
			return makeLocalStyle( style, state );
		};
	}

	/**
	 * simply eat characters if they must be there
	 */
	function eatChars( n, style ) {
		return function ( stream, state ) {
			for ( let i = 0; i < n; i++ ) {
				stream.next();
			}
			state.tokenize = state.stack.pop();
			return makeLocalStyle( style, state );
		};
	}

	function eatWikiText( style ) {
		return function ( stream, state ) {
			let tmp, mt, name, isCloseTag, tagname;
			const sol = stream.sol();

			if ( sol ) { // reset bold status in every new line
				state.isBold = false;
			}

			if ( stream.match( '//' ) ) {
				return makeStyle( style, state );
			} else if ( stream.match( urlProtocols ) ) { // highlight free external links, bug T108448
				state.stack.push( state.tokenize );
				state.tokenize = eatFreeExternalLink;
				state.lpar = false;
				return makeStyle( 'mw-free-extlink-protocol', state );
			}

			const ch = stream.next();
			if ( sol ) {
				switch ( ch ) {
					case '-':
						if ( stream.match( /^-{3,}/ ) ) {
							return 'mw-hr';
						}
						break;
					case '=':
						tmp = stream.match( /^(={0,5})(.+?(=\1\s*))$/u );
						if ( tmp ) { // Title
							stream.backUp( tmp[ 2 ].length );
							state.stack.push( state.tokenize );
							state.tokenize = eatSectionHeader( tmp[ 3 ].length );
							return makeLocalStyle( `mw-section-header line-cm-mw-section-${ tmp[ 1 ].length + 1 }`, state );
						}
						break;
					case '*':
					case '#':
						mt = stream.match( /^[*#;:]*/ );
						if ( mt[ 0 ].includes( ';' ) ) {
							state.isBold = true;
						}
						return makeLocalStyle( 'mw-list', state );
					case ';':
						state.isBold = true;
						stream.match( /^[*#;:]*/ );
						return makeLocalStyle( 'mw-list', state );
					case ':':
						if ( mt = stream.match( /^:*\s*(\{\||\{\{\{\s*!\s*\}\}|\{\{\s*\(!\s*\}\})/u ) ) { // Highlight indented tables :{|, bug T108454
							const [ , { length } ] = mt;
							state.stack.push( state.tokenize );
							state.tokenize = eatStartTable( length );
							stream.backUp( length );
							return makeLocalStyle( 'mw-list', state );
						}
						mt = stream.match( /^[*#;:]*/ );
						if ( mt[ 0 ].includes( ';' ) ) {
							state.isBold = true;
						}
						return makeLocalStyle( 'mw-list', state );
					case ' ':
						if ( mt = stream.match( /^\s*(:+\s*)?(\{\||\{\{\{\s*!\s*\}\}|\{\{\s*\(!\s*\}\})/u ) ) { // Leading spaces is the correct syntax for a table, bug T108454
							if ( mt[ 1 ] ) { // ::{|
								const [ ,, { length } ] = mt;
								state.stack.push( state.tokenize );
								state.tokenize = eatStartTable( length );
								stream.backUp( length );
								return makeLocalStyle( 'mw-list', state );
							}
							state.stack.push( state.tokenize );
							state.tokenize = inTableDefinition;
							return makeLocalStyle( 'mw-table-bracket', state );
						}
						return 'mw-skipformatting';
					case '{':
						if ( stream.match( /^(?:\||\{\{\s*!\s*\}\}|\{\s*\(!\s*\}\})\s*/u ) ) {
							state.stack.push( state.tokenize );
							state.tokenize = inTableDefinition;
							return makeLocalStyle( 'mw-table-bracket', state );
						}
				}
			}

			switch ( ch ) {
				case '&':
					return makeStyle( eatMnemonic( stream, style ), state );
				case '\'':
					if ( stream.match( /^'*(?='{5})/ ) || stream.match( /^'''(?!')/, false ) ) { // skip the irrelevant apostrophes ( >5 or =4 )
						break;
					} else if ( stream.match( '\'\'' ) ) { // bold
						return makeLocalStyle( 'mw-apostrophes-bold', state );
					} else if ( stream.eat( '\'' ) ) { // italic
						return makeLocalStyle( 'mw-apostrophes-italic', state );
					}
					break;
				case '[':
					if ( stream.eat( '[' ) ) { // Link Example: [[ Foo | Bar ]]
						stream.eatSpace();
						if ( /[^\]|[]/.test( stream.peek() ) ) {
							state.nLink++;
							state.stack.push( state.tokenize );
							const nsIds = typeof mw === 'object' ? mw.config.get( 'wgNamespaceIds' ) : { File: 6 },
								nsFile = Object.keys( nsIds ).filter( function ( ns ) {
									return nsIds[ ns ] === 6;
								} ).join( '|' ),
								nsFileRegex = new RegExp( `^\\s*(${ nsFile })\\s*:`, 'iu' );
							state.tokenize = stream.match( nsFileRegex, false ) ? inFileLink : inLink;
							return makeLocalStyle( 'mw-link-bracket', state );
						}
					} else {
						mt = stream.match( urlProtocols, false );
						if ( mt ) {
							state.nLink++;
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
					} else if ( stream.match( /^\{\s*/u ) ) {
						if ( stream.peek() === '#' ) { // Parser function
							state.nExt++;
							state.stack.push( state.tokenize );
							state.tokenize = inParserFunctionName;
							return makeLocalStyle( 'mw-parserfunction-bracket', state );
						}
						// Check for parser function without '#'
						name = stream.match( /^([^\s}[\]<{'|&:]+)(:|\s*)(\}\}?)?(.)?/u, false );
						if ( name ) {
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
					tagname = stream.match( /^[^>/\s.*,[\]{}$^+?|\\'`~<=!@#%&()-]+/u, false );
					if ( stream.match( '!--' ) ) { // comment
						state.stack.push( state.tokenize );
						state.tokenize = eatBlock( 'mw-comment', '-->' );
						return makeLocalStyle( 'mw-comment', state );
					} else if ( tagname ) {
						tagname = tagname[ 0 ].toLowerCase();
						if ( tagname in mwConfig.tags ) { // Parser function
							if ( isCloseTag === true ) {
								// @todo message
								return makeLocalStyle( 'error', state );
							}
							state.stack.push( state.tokenize );
							state.tokenize = eatTagName( tagname.length, isCloseTag, false );
							return makeLocalStyle( 'mw-exttag-bracket', state );
						} else if ( permittedHtmlTags.has( tagname ) ) { // Html tag
							if ( isCloseTag === true && tagname !== state.InHtmlTag.pop() ) {
								// @todo message
								return makeLocalStyle( 'error', state );
							} else if ( isCloseTag === true && voidHtmlTags.has( tagname ) ) {
								// @todo message
								return makeLocalStyle( 'error', state );
							}
							state.stack.push( state.tokenize );
							// || ( voidHtmlTags.has( tagname ) ) because opening void tags should also be treated as the closing tag.
							state.tokenize = eatTagName( tagname.length, isCloseTag || voidHtmlTags.has( tagname ), true );
							return makeLocalStyle( 'mw-htmltag-bracket', state );
						}
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
						name = stream.match( /^\w+__/ ); // The same as the end of function except '_' inside and with '__' at the end of string
						if ( name ) {
							const behavior = `__${ name[ 0 ] }`;
							if ( behavior.toLowerCase() in mwConfig.doubleUnderscore[ 0 ] || behavior in mwConfig.doubleUnderscore[ 1 ] ) {
								return 'mw-doubleUnderscore';
							} else if ( !stream.eol() ) {
								stream.backUp( 2 ); // Two underscore symbols at the end can be begining of other double undescored Magic Word
							}
							return makeStyle( style, state ); // Optimization: skip regex function at the end for EOL and backuped symbols
						}
					}
			}
			if ( /[\p{L}\d_]/u.test( ch ) || !/[a-z]/i.test( stream.peek() ) ) {
				stream.match( /^.*?(?=[&'[\]{}<>~"/|=!-]|__|[^\p{L}\d_][a-z])/iu );
			}
			return makeStyle( style, state );
		};
	}

	function eatFreeExternalLink( stream, state ) {
		let mt;
		if ( stream.eol() ) {
			// @todo error message
		} else if ( mt = stream.match( /^[^[\]<>"\0-\x1F\x7F\p{Zs}\uFFFD~{'),;.:!?]+/u ) ) {
			state.lpar = state.lpar || mt[ 0 ].includes( '(' );
			return makeStyle( 'mw-free-extlink', state );
		} else {
			const ch = stream.next(),
				next = stream.peek();
			switch ( ch ) {
				case '~': {
					if ( next !== '~' ) {
						return makeStyle( 'mw-free-extlink', state );
					}
					stream.next();
					if ( stream.peek() !== '~' ) {
						return makeStyle( 'mw-free-extlink', state );
					}
					stream.backUp( 1 );
					break;
				}
				case '{':
					if ( next !== '{' ) {
						return makeStyle( 'mw-free-extlink', state );
					}
					break;
				case '\'':
					if ( next !== '\'' ) {
						return makeStyle( 'mw-free-extlink', state );
					}
					break;
				case ')':
					if ( state.lpar ) {
						return makeStyle( 'mw-free-extlink', state );
					}
					// fall through
				case ',':
				case ';':
				case '.':
				case ':':
				case '!':
				case '?':
					if ( mt = stream.match( /^[),;.:!?]*(?:[^[\]<>"\0-\x1F\x7F\p{Zs}\uFFFD~{'),;.:!?]+|~{1,2}(?!~)|\{(?!\{)|'(?!'))/u ) ) {
						state.lpar = state.lpar || mt[ 0 ].includes( '(' );
						return makeStyle( 'mw-free-extlink', state );
					}
			}
		}
		stream.backUp( 1 );
		state.tokenize = state.stack.pop();
		return makeStyle( 'mw-free-extlink', state );
	}

	function eatSectionHeader( count ) {
		return function ( stream, state ) {
			if ( stream.match( /^[^&<[{~_']+/ ) ) {
				if ( stream.eol() ) {
					stream.backUp( count );
					state.tokenize = eatEnd( 'mw-section-header' );
				}
				return makeLocalStyle( '', state );
			}
			return eatWikiText( '' )( stream, state );
		};
	}

	function eatStartTable( n ) {
		return function ( stream, state ) {
			for ( let i = 0; i < n; i++ ) {
				stream.next();
			}
			state.tokenize = inTableDefinition;
			return makeLocalStyle( 'mw-table-bracket', state );
		};
	}

	function inTableDefinition( stream, state ) {
		if ( stream.sol() ) {
			state.tokenize = inTable;
			return inTable( stream, state );
		}
		return eatWikiText( 'mw-table-definition' )( stream, state );
	}

	function inTable( stream, state ) {
		if ( stream.sol() ) {
			stream.eatSpace();
			if ( stream.match( /^\{\{\s*!-\s*\}\}-*\s*/u ) ) {
				state.tokenize = inTableDefinition;
				return makeLocalStyle( 'mw-table-delimiter', state );
			} else if ( stream.match( /^\{\{\s*!\)\s*\}\}/u ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-table-bracket', state );
			} else if ( stream.match( /^(?:\||\{\{\s*!\s*\}\})/u ) ) {
				if ( stream.match( /^-+\s*/u ) ) {
					state.tokenize = inTableDefinition;
					return makeLocalStyle( 'mw-table-delimiter', state );
				} else if ( stream.eat( '+' ) ) {
					stream.eatSpace();
					state.tokenize = inTableCaption;
					return makeLocalStyle( 'mw-table-delimiter', state );
				} else if ( stream.eat( '}' ) ) {
					state.tokenize = state.stack.pop();
					return makeLocalStyle( 'mw-table-bracket', state );
				}
				stream.eatSpace();
				state.tokenize = eatTableRow( true, false );
				return makeLocalStyle( 'mw-table-delimiter', state );
			} else if ( stream.eat( '!' ) ) {
				stream.eatSpace();
				state.tokenize = eatTableRow( true, true );
				return makeLocalStyle( 'mw-table-delimiter', state );
			}
		}
		return eatWikiText( '' )( stream, state );
	}

	function inTableCaption( stream, state ) {
		if ( stream.sol() && stream.match( /^\s*(?:[|!]|\{\{\s*![!)-]?\s*\}\})/u, false ) ) {
			state.tokenize = inTable;
			return inTable( stream, state );
		}
		return eatWikiText( 'mw-table-caption' )( stream, state );
	}

	function eatTableRow( expectAttr, isHead ) {
		return function ( stream, state ) {
			if ( stream.sol() ) {
				if ( stream.match( /^\s*(?:[|!]|\{\{\s*![!)-]?\s*\}\})/u, false ) ) {
					state.tokenize = inTable;
					return inTable( stream, state );
				}
			} else if ( stream.match( /^[^'{[<&~!|]+/ ) ) {
				return makeLocalStyle( isHead ? 'strong' : '', state );
			} else if ( stream.match( /^(?:(?:\||\{\{\s*!\s*\}\}){2}|\{\{\s*!!\s*\}\})/u ) || isHead && stream.match( '!!' ) ) {
				state.tokenize = eatTableRow( true, isHead );
				return makeLocalStyle( 'mw-table-delimiter', state );
			} else if ( expectAttr && stream.match( /^(?:\||\{\{\s*!\s*\}\})/u ) ) {
				state.tokenize = eatTableRow( false, isHead );
				return makeLocalStyle( 'mw-table-delimiter2', state );
			}
			return eatWikiText( isHead ? 'strong' : '' )( stream, state );
		};
	}

	function inVariable( stream, state ) {
		if ( stream.match( /^[^{}|]+/ ) ) {
			return makeLocalStyle( 'mw-templatevariable-name', state );
		} else if ( stream.eat( '|' ) ) {
			state.tokenize = inVariableDefault;
			return makeLocalStyle( 'mw-templatevariable-delimiter', state );
		} else if ( stream.match( '}}}' ) ) {
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-templatevariable-bracket', state );
		} else if ( stream.match( '{{{' ) ) {
			state.stack.push( state.tokenize );
			return makeLocalStyle( 'mw-templatevariable-bracket', state );
		}
		stream.next();
		return makeLocalStyle( 'mw-templatevariable-name', state );
	}

	function inVariableDefault( stream, state ) {
		if ( stream.match( /^[^{}[<&~]+/ ) ) {
			return makeLocalStyle( 'mw-templatevariable', state );
		} else if ( stream.match( '}}}' ) ) {
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-templatevariable-bracket', state );
		}
		return eatWikiText( 'mw-templatevariable' )( stream, state );
	}

	function inParserFunctionName( stream, state ) {
		if ( stream.match( /^[^:}{~|<>[\]]+/ ) ) { // FIXME: {{#name}} and {{uc}} are wrong, must have ':'
			return makeLocalStyle( 'mw-parserfunction-name', state );
		} else if ( stream.eat( ':' ) ) {
			state.tokenize = inParserFunctionArguments;
			return makeLocalStyle( 'mw-parserfunction-delimiter', state );
		} else if ( stream.match( '}}' ) ) {
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
		}
		return eatWikiText( 'error' )( stream, state );
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

	function eatTemplatePageName( haveAte ) {
		return function ( stream, state ) {
			if ( stream.match( /^\s*\|\s*/u ) ) {
				state.tokenize = eatTemplateArgument( true );
				return makeLocalStyle( 'mw-template-delimiter', state );
			} else if ( stream.match( /^\s*\}\}/u ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
			} else if ( stream.match( /^\s*<!--.*?-->/u ) ) {
				return makeLocalStyle( 'mw-comment', state );
			} else if ( haveAte && stream.sol() ) {
				// @todo error message
				state.nTemplate--;
				state.tokenize = state.stack.pop();
				return '';
			} else if ( stream.match( /^\s*[^\s|&~#<>[\]{}]+/u ) ) {
				state.tokenize = eatTemplatePageName( true );
				return makeLocalStyle( 'mw-template-name mw-pagename', state );
			} else if ( stream.eatSpace() ) {
				return stream.eol()
					? makeLocalStyle( 'mw-template-name', state )
					: makeLocalStyle( 'mw-template-name mw-pagename', state );
			} else if ( !stream.match( '{{', false ) && stream.eat( /[#<>[\]{}]/ ) ) {
				return makeLocalStyle( 'error', state );
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
			for ( let i = 0; i < chars; i++ ) {
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
			return '';
		} else if ( stream.match( /^\s*\]/u ) ) {
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
		} else if ( stream.eatSpace() ) {
			state.tokenize = inExternalLinkText;
			return makeLocalStyle( '', state );
		} else if ( stream.match( /^[^\s\]{&~']+/u ) || stream.eatSpace() ) {
			if ( stream.peek() === '\'' ) {
				if ( stream.match( '\'\'', false ) ) {
					state.tokenize = inExternalLinkText;
				} else {
					stream.next();
				}
			}
			return makeLocalStyle( 'mw-extlink', state );
		}
		return eatWikiText( 'mw-extlink' )( stream, state );
	}

	function inExternalLinkText( stream, state ) {
		if ( stream.sol() ) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			return '';
		} else if ( stream.eat( ']' ) ) {
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
		} else if ( stream.match( /^[^'\]{&~<]+/ ) ) {
			return makeStyle( 'mw-extlink-text', state );
		}
		return eatWikiText( 'mw-extlink-text' )( stream, state );
	}

	function inLink( stream, state ) {
		if ( stream.sol() ) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			return '';
		} else if ( stream.match( /^\s*#\s*/u ) ) {
			state.tokenize = inLinkToSection();
			return makeLocalStyle( 'mw-link', state );
		} else if ( stream.match( /^\s*\|\s*/u ) ) {
			state.tokenize = eatLinkText();
			return makeLocalStyle( 'mw-link-delimiter', state );
		} else if ( stream.match( /^\s*\]\]/u ) ) {
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
		} else if ( stream.match( /^\s*[^\s|&~#<>[\]{}]+/u ) || stream.eatSpace() ) { // FIXME '{{' brokes Link, sample [[z{{page]]
			return makeLocalStyle( 'mw-link-pagename mw-pagename', state );
		} else if ( !stream.match( '{{', false ) && stream.eat( /[<>[\]{}]/ ) ) {
			return makeLocalStyle( 'error', state );
		}
		return eatWikiText( 'mw-link-pagename mw-pagename' )( stream, state );
	}

	function inLinkToSection() {
		return function ( stream, state ) {
			if ( stream.sol() ) {
				// @todo error message
				state.nLink--;
				state.tokenize = state.stack.pop();
				return '';
			} else if ( stream.match( /^[^|\]&~{}]+/ ) ) { // FIXME '{{' brokes Link, sample [[z{{page]]
				return makeLocalStyle( 'mw-link-tosection', state );
			} else if ( stream.eat( '|' ) ) {
				state.tokenize = eatLinkText();
				return makeLocalStyle( 'mw-link-delimiter', state );
			} else if ( stream.match( ']]' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			}
			return eatWikiText( 'mw-link-tosection' )( stream, state );
		};
	}

	function inFileLink( stream, state ) {
		if ( stream.sol() ) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			return '';
		} else if ( stream.match( /^\s*\|\s*/u ) ) {
			state.tokenize = eatLinkText( true );
			return makeLocalStyle( 'mw-link-delimiter', state );
		} else if ( stream.match( /^\s*\]\]/u ) ) {
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
		} else if ( stream.match( /^\s*[^\s|&~#<>[\]{}]+/u ) || stream.eatSpace() ) { // FIXME '{{' brokes Link, sample [[z{{page]]
			return makeLocalStyle( 'mw-link-pagename mw-pagename', state );
		} else if ( !stream.match( '{{', false ) && stream.eat( /[#<>[\]{}]/ ) ) {
			return makeLocalStyle( 'error', state );
		}
		return eatWikiText( 'mw-link-pagename mw-pagename' )( stream, state );
	}

	function eatLinkText( isFile, bracketEaten ) {
		return function ( stream, state ) {
			const tmpstyle = 'mw-link-text',
				regex = isFile ? /^[^'\]{&~<|[]+/ : /^[^'\]{&~<]+/;
			if ( stream.match( ']]' ) ) {
				if ( !bracketEaten && stream.peek() === ']' ) {
					stream.backUp( 1 );
					state.tokenize = eatLinkText( isFile, true );
					return makeLocalStyle( tmpstyle, state );
				}
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			} else if ( isFile && stream.eat( '|' ) ) {
				return makeLocalStyle( 'mw-link-delimiter', state );
			} else if ( stream.match( '\'\'\'' ) ) {
				return makeLocalStyle( 'mw-link-text mw-apostrophes-bold', state );
			} else if ( stream.match( '\'\'' ) ) {
				return makeLocalStyle( 'mw-link-text mw-apostrophes-italic', state );
			} else if ( stream.match( regex ) ) {
				return makeLocalStyle( tmpstyle, state );
			}
			return eatWikiText( tmpstyle )( stream, state );
		};
	}

	function eatTagName( chars, isCloseTag, isHtmlTag ) {
		return function ( stream, state ) {
			let name = '';
			for ( let i = 0; i < chars; i++ ) {
				name += stream.next();
			}
			name = name.toLowerCase();
			stream.eatSpace();

			if ( isHtmlTag ) {
				state.tokenize = eatHtmlTagAttribute( name, isCloseTag && !voidHtmlTags.has( name ) );
				return makeLocalStyle( 'mw-htmltag-name', state );
			} // it is the extension tag
			if ( isCloseTag ) {
				state.tokenize = eatChars( 1, 'mw-exttag-bracket' );
			} else {
				state.tokenize = eatExtTagAttribute( name );
			}
			return makeLocalStyle( 'mw-exttag-name', state );
		};
	}

	function eatHtmlTagAttribute( name, isCloseTag ) {
		const style = `mw-htmltag-attribute${ isCloseTag ? ' error' : '' }`;
		return function ( stream, state ) {
			if ( stream.match( /^[^>/<{&~]+/ ) ) {
				return makeLocalStyle( style, state );
			} else if ( stream.eat( '>' ) ) {
				if ( !( voidHtmlTags.has( name ) || isCloseTag ) ) {
					state.InHtmlTag.push( name );
				}
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-htmltag-bracket', state );
			} else if ( stream.match( '/>' ) ) {
				if ( !( voidHtmlTags.has( name ) || isCloseTag ) ) { // HTML5 standard
					state.InHtmlTag.push( name );
				}
				state.tokenize = state.stack.pop();
				return makeLocalStyle( `mw-htmltag-bracket${ voidHtmlTags.has( name ) ? '' : ' error' }`, state );
			}
			return eatWikiText( style )( stream, state );
		};
	}

	function eatExtTagAttribute( name ) {
		return function ( stream, state ) {
			if ( stream.match( /^(?:"[^">]*"|'[^'>]*'|[^>/<{&~])+/ ) ) {
				return makeLocalStyle( 'mw-exttag-attribute', state );
			} else if ( stream.eat( '>' ) ) {
				state.extName = name;
				if ( name in mwConfig.tagModes ) {
					state.extMode = CodeMirror.getMode( { mode: 'mediawiki', mwConfig }, mwConfig.tagModes[ name ] );
					state.extState = CodeMirror.startState( state.extMode );
				}
				state.tokenize = eatExtTagArea( name );
				return makeLocalStyle( 'mw-exttag-bracket', state );
			} else if ( stream.match( '/>' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-exttag-bracket', state );
			}
			return eatWikiText( 'mw-exttag-attribute' )( stream, state );
		};
	}

	function eatExtTagArea( name ) {
		return function ( stream, state ) {
			const { pos: from } = stream,
				pattern = new RegExp( `</${ name }\\s*>`, 'iu' ),
				m = pattern.exec( from ? stream.string.slice( from ) : stream.string );
			let origString = false,
				to;

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
			return makeLocalStyle( 'mw-exttag-bracket', state );
		};
	}

	function eatExtTokens( origString ) {
		return function ( stream, state ) {
			let ret;
			if ( state.extMode === false ) {
				ret = 'mw-exttag';
				stream.skipToEnd();
			} else {
				ret = `mw-tag-${ state.extName } ${ state.extMode.token( stream, state.extState, origString === false ) }`;
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

	CodeMirror.defineMode( 'mediawiki', function ( config /* , parserConfig */ ) {
		( { mwConfig } = config );
		urlProtocols = new RegExp( `^(?:${ mwConfig.urlProtocols })`, 'i' );

		return {
			startState() {
				return {
					tokenize: eatWikiText( '' ), stack: [], InHtmlTag: [], extName: false, extMode: false,
					extState: false, nTemplate: 0, nLink: 0, nExt: 0, isBold: false, lpar: false
				};
			},
			copyState( state ) {
				return {
					tokenize: state.tokenize,
					stack: state.stack.concat( [] ),
					InHtmlTag: state.InHtmlTag.concat( [] ),
					extName: state.extName,
					extMode: state.extMode,
					extState: state.extMode !== false && CodeMirror.copyState( state.extMode, state.extState ),
					nTemplate: state.nTemplate,
					nLink: state.nLink,
					nExt: state.nExt,
					isBold: false,
					lpar: false
				};
			},
			token( stream, state ) {
				return state.tokenize( stream, state ); // get token style
			}
		};
	} );

	CodeMirror.defineMIME( 'text/mediawiki', 'mediawiki' );

	function eatPre( stream, state ) {
		if ( stream.match( /^[^&<]+/ ) ) {
			return '';
		} else if ( stream.eat( '<' ) ) {
			if ( !state.nowiki && stream.match( 'nowiki>' ) || state.nowiki && stream.match( '/nowiki>' ) ) {
				state.nowiki = !state.nowiki;
				return 'mw-comment';
			}
			return '';
		}
		stream.next(); // eat &
		return eatMnemonic( stream, '' );
	}

	function eatNowiki( stream ) {
		if ( stream.match( /^[^&]+/ ) ) {
			return '';
		}
		stream.next(); // eat &
		return eatMnemonic( stream, '' );
	}

	CodeMirror.defineMode( 'mw-tag-pre', function ( /* config, parserConfig */ ) {
		return {
			startState() {
				return { nowiki: false };
			},
			copyState( state ) {
				return { nowiki: state.nowiki };
			},
			token: eatPre
		};
	} );

	CodeMirror.defineMode( 'mw-tag-nowiki', function ( /* config, parserConfig */ ) {
		return {
			startState() {
				return {};
			},
			token: eatNowiki
		};
	} );
}( CodeMirror ) );
