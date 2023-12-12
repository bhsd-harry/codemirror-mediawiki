import { LanguageSupport, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { modeConfig } from './config';
import type { StreamParser, StringStream } from '@codemirror/language';
import type { Highlighter } from '@lezer/highlight';

declare type Tokenizer = ( stream: StringStream, state: State ) => string;

declare interface State {
	tokenize: Tokenizer;
	stack: Tokenizer[];
	inHtmlTag: string[];
	extName: string | false;
	extMode: StreamParser<unknown> | false;
	extState: State | false;
	nTemplate: number;
	nLink: number;
	nExt: number;
}

declare interface Token {
	pos: number;
	style: string;
	state: State | string;
}

export interface MwConfig {
	urlProtocols: string;
	tags: Record<string, true>;
	tagModes: Record<string, string>;
	functionSynonyms: [Record<string, string>, Record<string, string>];
	doubleUnderscore: [Record<string, string>, Record<string, string>];
}

/**
 * Adapted from the original CodeMirror 5 stream parser by Pavel Astakhov
 */
class CodeMirrorModeMediaWiki {
	declare config: MwConfig;
	declare urlProtocols: RegExp;
	declare isBold: boolean;
	declare wasBold: boolean;
	declare isItalic: boolean;
	declare wasItalic: boolean;
	declare firstSingleLetterWord: number | null;
	declare firstMultiLetterWord: number | null;
	declare firstSpace: number | null;
	declare oldStyle: string | null;
	declare tokens: Token[];
	declare oldTokens: Token[];

	constructor( config: MwConfig ) {
		this.config = config;
		this.urlProtocols = new RegExp( `^(?:${ this.config.urlProtocols })`, 'i' );
		this.isBold = false;
		this.wasBold = false;
		this.isItalic = false;
		this.wasItalic = false;
		this.firstSingleLetterWord = null;
		this.firstMultiLetterWord = null;
		this.firstSpace = null;
		this.oldStyle = null;
		this.tokens = [];
		this.oldTokens = [];
	}

	eatMnemonic( stream: StringStream, style: string, mnemonicStyle: string ): string {
		let ok;
		if ( stream.eat( '#' ) ) {
			if ( stream.eat( 'x' ) ) {
				ok = stream.eatWhile( /[a-f\d]/i ) && stream.eat( ';' );
			} else {
				ok = stream.eatWhile( /\d/ ) && stream.eat( ';' );
			}
		} else {
			ok = stream.eatWhile( /[\w.\-:]/ ) && stream.eat( ';' );
		}
		if ( ok ) {
			mnemonicStyle += ' ' + modeConfig.tags.mnemonic;
			return mnemonicStyle;
		}
		return style;
	}

	makeStyle( style: string, state: State, endGround?: 'nTemplate' | 'nLink' | 'nExt' ): string {
		if ( this.isBold ) {
			style += ' ' + modeConfig.tags.strong;
		}
		if ( this.isItalic ) {
			style += ' ' + modeConfig.tags.em;
		}
		return this.makeLocalStyle( style, state, endGround );
	}

	makeLocalStyle( style: string, state: State, endGround?: 'nTemplate' | 'nLink' | 'nExt' ): string {
		let ground = '';

		/**
		 * List out token names in a comment for search purposes.
		 *
		 * Tokens used here include:
		 * - mw-ext-ground
		 * - mw-ext-link-ground
		 * - mw-ext2-ground
		 * - mw-ext2-link-ground
		 * - mw-ext3-ground
		 * - mw-ext3-link-ground
		 * - mw-link-ground
		 * - mw-template-ext-ground
		 * - mw-template-ext-link-ground
		 * - mw-template-ext2-ground
		 * - mw-template-ext2-link-ground
		 * - mw-template-ext3-ground
		 * - mw-template-ext3-link-ground
		 * - mw-template-link-ground
		 * - mw-template2-ext-ground
		 * - mw-template2-ext-link-ground
		 * - mw-template2-ext2-ground
		 * - mw-template2-ext2-link-ground
		 * - mw-template2-ext3-ground
		 * - mw-template2-ext3-link-ground
		 * - mw-template2-ground
		 * - mw-template2-link-ground
		 * - mw-template3-ext-ground
		 * - mw-template3-ext-link-ground
		 * - mw-template3-ext2-ground
		 * - mw-template3-ext2-link-ground
		 * - mw-template3-ext3-ground
		 * - mw-template3-ext3-link-ground
		 * - mw-template3-ground
		 * - mw-template3-link-ground
		 *
		 * NOTE: these should be defined in CodeMirrorModeMediaWikiConfig.tokenTable()
		 *   and CodeMirrorModeMediaWikiConfig.highlightStyle()
		 */
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
				break;
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
				break;
		}
		if ( state.nLink > 0 ) {
			ground += '-link';
		}
		if ( ground !== '' ) {
			style = `mw${ ground }-ground ${ style }`;
		}
		if ( endGround ) {
			state[ endGround ]--;
		}
		return style.trim();
	}

	eatBlock( style: string, terminator: string, consumeLast = true ) {
		return ( stream: StringStream, state: State ): string => {
			if ( stream.skipTo( terminator ) ) {
				if ( !consumeLast ) {
					stream.match( terminator );
				}
				state.tokenize = state.stack.pop()!;
			} else {
				stream.skipToEnd();
			}
			return this.makeLocalStyle( style, state );
		};
	}

	eatEnd( style: string ) {
		return ( stream: StringStream, state: State ): string => {
			stream.skipToEnd();
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle( style, state );
		};
	}

	eatChar( char: string, style: string ) {
		return ( stream: StringStream, state: State ): string => {
			state.tokenize = state.stack.pop()!;
			if ( stream.eat( char ) ) {
				return this.makeLocalStyle( style, state );
			}
			return this.makeLocalStyle( modeConfig.tags.error, state );
		};
	}

	eatSectionHeader( count: number ) {
		return ( stream: StringStream, state: State ): string => {
			if ( stream.match( /^[^&<[{~]+/ ) ) {
				if ( stream.eol() ) {
					stream.backUp( count );
					state.tokenize = this.eatEnd( modeConfig.tags.sectionHeader );
				} else if ( stream.match( /^<!--(?!.*?-->.*?=)/, false ) ) {
					// T171074: handle trailing comments
					stream.backUp( count );
					state.tokenize = this.eatBlock( modeConfig.tags.sectionHeader, '<!--', false );
				}
				return '';
			}
			return this.eatWikiText( '', '' )( stream, state );
		};
	}

	inVariable( stream: StringStream, state: State ): string {
		if ( stream.match( /^[^{}|]+/ ) ) {
			return this.makeLocalStyle( modeConfig.tags.templateVariableName, state );
		}
		if ( stream.eat( '|' ) ) {
			state.tokenize = this.inVariableDefault.bind( this );
			return this.makeLocalStyle( modeConfig.tags.templateVariableDelimiter, state );
		}
		if ( stream.match( '}}}' ) ) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle( modeConfig.tags.templateVariableBracket, state );
		}
		if ( stream.match( '{{{' ) ) {
			state.stack.push( state.tokenize );
			return this.makeLocalStyle( modeConfig.tags.templateVariableBracket, state );
		}
		stream.next();
		return this.makeLocalStyle( modeConfig.tags.templateVariableName, state );
	}

	inVariableDefault( stream: StringStream, state: State ): string {
		if ( stream.match( /^[^{}[<&~]+/ ) ) {
			return this.makeLocalStyle( modeConfig.tags.templateVariable, state );
		}
		if ( stream.match( '}}}' ) ) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle( modeConfig.tags.templateVariableBracket, state );
		}
		return this.eatWikiText( modeConfig.tags.templateVariable, '' )( stream, state );
	}

	inParserFunctionName( stream: StringStream, state: State ): string {
		// FIXME: {{#name}} and {{uc}} are wrong, must have ':'
		if ( stream.match( /^[^:}{~]+/ ) ) {
			return this.makeLocalStyle( modeConfig.tags.parserFunctionName, state );
		}
		if ( stream.eat( ':' ) ) {
			state.tokenize = this.inParserFunctionArguments.bind( this );
			return this.makeLocalStyle( modeConfig.tags.parserFunctionDelimiter, state );
		}
		if ( stream.match( '}}' ) ) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle( modeConfig.tags.parserFunctionBracket, state, 'nExt' );
		}
		return this.eatWikiText( modeConfig.tags.parserFunction, '' )( stream, state );
	}

	inParserFunctionArguments( stream: StringStream, state: State ): string {
		if ( stream.match( /^[^|}{[<&~]+/ ) ) {
			return this.makeLocalStyle( modeConfig.tags.parserFunction, state );
		} else if ( stream.eat( '|' ) ) {
			return this.makeLocalStyle( modeConfig.tags.parserFunctionDelimiter, state );
		} else if ( stream.match( '}}' ) ) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle( modeConfig.tags.parserFunctionBracket, state, 'nExt' );
		}
		return this.eatWikiText( modeConfig.tags.parserFunction, '' )( stream, state );
	}

	eatTemplatePageName( haveAte: boolean ) {
		return ( stream: StringStream, state: State ): string => {
			if ( stream.match( /^\s*\|\s*/ ) ) {
				state.tokenize = this.eatTemplateArgument( true );
				return this.makeLocalStyle( modeConfig.tags.templateDelimiter, state );
			}
			if ( stream.match( /^\s*\}\}/ ) ) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle( modeConfig.tags.templateBracket, state, 'nTemplate' );
			}
			if ( stream.match( /^\s*<!--.*?-->/ ) ) {
				return this.makeLocalStyle( modeConfig.tags.comment, state );
			}
			if ( haveAte && stream.sol() ) {
				// @todo error message
				state.nTemplate--;
				state.tokenize = state.stack.pop()!;
				return '';
			}
			if ( stream.match( /^\s*[^\s|}<{&~]+/ ) ) {
				state.tokenize = this.eatTemplatePageName( true );
				return this.makeLocalStyle( modeConfig.tags.templateName, state );
			} else if ( stream.eatSpace() ) {
				if ( stream.eol() ) {
					return this.makeLocalStyle( modeConfig.tags.templateName, state );
				}
				return this.makeLocalStyle( modeConfig.tags.templateName, state );
			}
			return this.eatWikiText(
				modeConfig.tags.templateName,
				`${ modeConfig.tags.templateName }-mnemonic`
			)( stream, state );
		};
	}

	eatTemplateArgument( expectArgName: boolean ) {
		return ( stream: StringStream, state: State ): string => {
			if ( expectArgName && stream.eatWhile( /[^=|}{[<&~]/ ) ) {
				if ( stream.eat( '=' ) ) {
					state.tokenize = this.eatTemplateArgument( false );
					return this.makeLocalStyle( modeConfig.tags.templateArgumentName, state );
				}
				return this.makeLocalStyle( modeConfig.tags.template, state );
			} else if ( stream.eatWhile( /[^|}{[<&~]/ ) ) {
				return this.makeLocalStyle( modeConfig.tags.template, state );
			} else if ( stream.eat( '|' ) ) {
				state.tokenize = this.eatTemplateArgument( true );
				return this.makeLocalStyle( modeConfig.tags.templateDelimiter, state );
			} else if ( stream.match( '}}' ) ) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle( modeConfig.tags.templateBracket, state, 'nTemplate' );
			}
			return this.eatWikiText( modeConfig.tags.template, '' )( stream, state );
		};
	}

	eatExternalLinkProtocol( chars: number ) {
		return ( stream: StringStream, state: State ): string => {
			while ( chars > 0 ) {
				chars--;
				stream.next();
			}
			if ( stream.eol() ) {
				state.nLink--;
				// @todo error message
				state.tokenize = state.stack.pop()!;
			} else {
				state.tokenize = this.inExternalLink.bind( this );
			}
			return this.makeLocalStyle( modeConfig.tags.extLinkProtocol, state );
		};
	}

	inExternalLink( stream: StringStream, state: State ): string {
		if ( stream.sol() ) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop()!;
			return '';
		}
		if ( stream.match( /^\s*\]/ ) ) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle( modeConfig.tags.extLinkBracket, state, 'nLink' );
		}
		if ( stream.eatSpace() ) {
			state.tokenize = this.inExternalLinkText.bind( this );
			return this.makeStyle( '', state );
		}
		if ( stream.match( /^[^\s\]{&~']+/ ) || stream.eatSpace() ) {
			if ( stream.peek() === '\'' ) {
				if ( stream.match( '\'\'', false ) ) {
					state.tokenize = this.inExternalLinkText.bind( this );
				} else {
					stream.next();
				}
			}
			return this.makeStyle( modeConfig.tags.extLink, state );
		}
		return this.eatWikiText( modeConfig.tags.extLink, '' )( stream, state );
	}

	inExternalLinkText( stream: StringStream, state: State ): string {
		if ( stream.sol() ) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop()!;
			return '';
		}
		if ( stream.eat( ']' ) ) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle( modeConfig.tags.extLinkBracket, state, 'nLink' );
		}
		if ( stream.match( /^[^'\]{&~<]+/ ) ) {
			return this.makeStyle( modeConfig.tags.extLinkText, state );
		}
		return this.eatWikiText( modeConfig.tags.extLinkText, '' )( stream, state );
	}

	inLink( stream: StringStream, state: State ): string {
		if ( stream.sol() ) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop()!;
			return '';
		}
		if ( stream.match( /^\s*#\s*/ ) ) {
			state.tokenize = this.inLinkToSection.bind( this );
			return this.makeLocalStyle( modeConfig.tags.link, state );
		}
		if ( stream.match( /^\s*\|\s*/ ) ) {
			state.tokenize = this.eatLinkText();
			return this.makeLocalStyle( modeConfig.tags.linkDelimiter, state );
		}
		if ( stream.match( /^\s*\]\]/ ) ) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle( modeConfig.tags.linkBracket, state, 'nLink' );
		}
		if ( stream.match( /^\s*[^\s#|\]&~{]+/ ) || stream.eatSpace() ) {
			return this.makeStyle(
				`${ modeConfig.tags.linkPageName } ${ modeConfig.tags.pageName }`,
				state
			);
		}
		return this.eatWikiText(
			`${ modeConfig.tags.linkPageName } ${ modeConfig.tags.pageName }`,
			modeConfig.tags.pageName
		)( stream, state );
	}

	inLinkToSection( stream: StringStream, state: State ): string {
		if ( stream.sol() ) {
			// @todo error message
			state.nLink--;
			state.tokenize = state.stack.pop()!;
			return '';
		}
		if ( stream.match( /^[^|\]&~{}]+/ ) ) { // FIXME '{{' brokes Link, sample [[z{{page]]
			return this.makeLocalStyle( modeConfig.tags.linkToSection, state );
		}
		if ( stream.eat( '|' ) ) {
			state.tokenize = this.eatLinkText();
			return this.makeLocalStyle( modeConfig.tags.linkDelimiter, state );
		}
		if ( stream.match( ']]' ) ) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle( modeConfig.tags.linkBracket, state, 'nLink' );
			// if ( !stream.eatSpace() ) {
			// state.ImInBlock.push( 'LinkTrail' );
			// }
		}
		return this.eatWikiText( modeConfig.tags.linkToSection, '' )( stream, state );
	}

	eatLinkText(): ( stream: StringStream, state: State ) => string {
		let linkIsBold: boolean,
			linkIsItalic: boolean;

		return ( stream: StringStream, state: State ): string => {
			let tmpstyle: string;
			if ( stream.match( ']]' ) ) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle( modeConfig.tags.linkBracket, state, 'nLink' );
			}
			if ( stream.match( '\'\'\'' ) ) {
				linkIsBold = !linkIsBold;
				return this.makeLocalStyle(
					`${ modeConfig.tags.linkText } ${ modeConfig.tags.apostrophes }`,
					state
				);
			}
			if ( stream.match( '\'\'' ) ) {
				linkIsItalic = !linkIsItalic;
				return this.makeLocalStyle(
					`${ modeConfig.tags.linkText } ${ modeConfig.tags.apostrophes }`,
					state
				);
			}
			tmpstyle = modeConfig.tags.linkText;
			if ( linkIsBold ) {
				tmpstyle += ' ' + modeConfig.tags.strong;
			}
			if ( linkIsItalic ) {
				tmpstyle += ' ' + modeConfig.tags.em;
			}
			if ( stream.match( /^[^'\]{&~<]+/ ) ) {
				return this.makeStyle( tmpstyle, state );
			}
			return this.eatWikiText( tmpstyle, '' )( stream, state );
		};
	}

	eatTagName( chars: number, isCloseTag: boolean, isHtmlTag: boolean ) {
		return ( stream: StringStream, state: State ): string => {
			let name = '';
			while ( chars > 0 ) {
				chars--;
				name += stream.next();
			}
			stream.eatSpace();

			if ( isHtmlTag ) {
				if ( isCloseTag && !modeConfig.implicitlyClosedHtmlTags[ name ] ) {
					state.tokenize = this.eatChar( '>', modeConfig.tags.htmlTagBracket );
				} else {
					state.tokenize = this.eatHtmlTagAttribute( name );
				}
				return this.makeLocalStyle( modeConfig.tags.htmlTagName, state );
			} // it is the extension tag
			if ( isCloseTag ) {
				state.tokenize = this.eatChar(
					'>',
					`${ modeConfig.tags.extLinkBracket } mw-ext-${ name }`
				);
			} else {
				state.tokenize = this.eatExtTagAttribute( name );
			}
			return this.makeLocalStyle( 'mw-exttag-name mw-ext-' + name, state );
		};
	}

	eatHtmlTagAttribute( name: string ) {
		return ( stream: StringStream, state: State ): string => {
			if ( stream.match( /^(?:"[^<">]*"|'[^<'>]*'|[^>/<{&~])+/ ) ) {
				return this.makeLocalStyle( modeConfig.tags.htmlTagAttribute, state );
			}
			if ( stream.eat( '>' ) ) {
				if ( !( name in modeConfig.implicitlyClosedHtmlTags ) ) {
					state.inHtmlTag.push( name );
				}
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle( modeConfig.tags.htmlTagBracket, state );
			}
			if ( stream.match( '/>' ) ) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle( modeConfig.tags.htmlTagBracket, state );
			}
			return this.eatWikiText( modeConfig.tags.htmlTagAttribute, '' )( stream, state );
		};
	}

	eatExtTagAttribute( name: string ) {
		return ( stream: StringStream, state: State ): string => {
			if ( stream.match( /^(?:"[^">]*"|'[^'>]*'|[^>/<{&~])+/ ) ) {
				return this.makeLocalStyle( `mw-exttag-attribute mw-ext-${ name }`, state );
			}
			if ( stream.eat( '>' ) ) {
				state.extName = name;
				if ( name in this.config.tagModes ) {
					// FIXME: tracked at T348684
					// state.extMode = CodeMirror.getMode(
					//  this.config,
					//  this.config.tagModes[ name ]
					// );
					// state.extState = CodeMirror.startState( state.extMode );
				}
				state.tokenize = this.eatExtTagArea( name );
				return this.makeLocalStyle( 'mw-exttag-bracket mw-ext-' + name, state );
			}
			if ( stream.match( '/>' ) ) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle( 'mw-exttag-bracket mw-ext-' + name, state );
			}
			return this.eatWikiText( 'mw-exttag-attribute mw-ext-' + name, '' )( stream, state );
		};
	}

	eatExtTagArea( name: string ) {
		return ( stream: StringStream, state: State ): string => {
			const from = stream.pos,
				pattern = new RegExp( `</${ name }\\s*>`, 'i' ),
				m = pattern.exec( from ? stream.string.slice( from ) : stream.string );
			let origString: string | false = false,
				to;

			if ( m ) {
				if ( m.index === 0 ) {
					state.tokenize = this.eatExtCloseTag( name );
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
			state.tokenize = this.eatExtTokens( origString );
			return state.tokenize( stream, state );
		};
	}

	eatExtCloseTag( name: string ) {
		return ( stream: StringStream, state: State ): string => {
			stream.next(); // eat <
			stream.next(); // eat /
			state.tokenize = this.eatTagName( name.length, true, false );
			return this.makeLocalStyle( 'mw-exttag-bracket mw-ext-' + name, state );
		};
	}

	eatExtTokens( origString: string | false ) {
		return ( stream: StringStream, state: State ): string => {
			let ret: string;
			if ( state.extMode === false ) {
				ret = origString === false && stream.sol() ? 'line-cm-mw-exttag' : 'mw-exttag';
				stream.skipToEnd();
			} else {
				ret = (
					origString === false && stream.sol() ? 'line-cm-mw-tag-' : 'mw-tag-'
				) + state.extName;
				ret += ' ' + state.extMode.token( stream, state.extState );
			}
			if ( stream.eol() ) {
				if ( origString !== false ) {
					stream.string = origString;
				}
				state.tokenize = state.stack.pop()!;
			}
			return this.makeLocalStyle( ret, state );
		};
	}

	eatStartTable( stream: StringStream, state: State ): string {
		stream.match( '{|' );
		stream.eatSpace();
		state.tokenize = this.inTableDefinition.bind( this );
		return modeConfig.tags.tableBracket;
	}

	inTableDefinition( stream: StringStream, state: State ): string {
		if ( stream.sol() ) {
			state.tokenize = this.inTable.bind( this );
			return this.inTable( stream, state );
		}
		return this.eatWikiText( modeConfig.tags.tableDefinition, '' )( stream, state );
	}

	inTableCaption( stream: StringStream, state: State ): string {
		if ( stream.sol() && stream.match( /^\s*[|!]/, false ) ) {
			state.tokenize = this.inTable.bind( this );
			return this.inTable( stream, state );
		}
		return this.eatWikiText( modeConfig.tags.tableCaption, '' )( stream, state );
	}

	inTable( stream: StringStream, state: State ): string {
		if ( stream.sol() ) {
			stream.eatSpace();
			if ( stream.eat( '|' ) ) {
				if ( stream.eat( '-' ) ) {
					stream.eatSpace();
					state.tokenize = this.inTableDefinition.bind( this );
					return this.makeLocalStyle( modeConfig.tags.tableDelimiter, state );
				}
				if ( stream.eat( '+' ) ) {
					stream.eatSpace();
					state.tokenize = this.inTableCaption.bind( this );
					return this.makeLocalStyle( modeConfig.tags.tableDelimiter, state );
				}
				if ( stream.eat( '}' ) ) {
					state.tokenize = state.stack.pop()!;
					return this.makeLocalStyle( modeConfig.tags.tableBracket, state );
				}
				stream.eatSpace();
				state.tokenize = this.eatTableRow( true, false );
				return this.makeLocalStyle( modeConfig.tags.tableDelimiter, state );
			}
			if ( stream.eat( '!' ) ) {
				stream.eatSpace();
				state.tokenize = this.eatTableRow( true, true );
				return this.makeLocalStyle( modeConfig.tags.tableDelimiter, state );
			}
		}
		return this.eatWikiText( '', '' )( stream, state );
	}

	eatTableRow( isStart: boolean, isHead: boolean ) {
		return ( stream: StringStream, state: State ): string => {
			if ( stream.sol() ) {
				if ( stream.match( /^\s*[|!]/, false ) ) {
					state.tokenize = this.inTable.bind( this );
					return this.inTable( stream, state );
				}
			} else {
				if ( stream.match( /^[^'|{[<&~!]+/ ) ) {
					return this.makeStyle( isHead ? modeConfig.tags.strong : '', state );
				}
				if (
					stream.match( '||' )
					|| isHead && stream.match( '!!' )
					|| isStart && stream.eat( '|' )
				) {
					this.isBold = false;
					this.isItalic = false;
					if ( isStart ) {
						state.tokenize = this.eatTableRow( false, isHead );
					}
					return this.makeLocalStyle( modeConfig.tags.tableDelimiter, state );
				}
			}
			const tag = isHead ? modeConfig.tags.strong : '';
			return this.eatWikiText( tag, tag )( stream, state );
		};
	}

	eatFreeExternalLinkProtocol( stream: StringStream, state: State ): string {
		stream.match( this.urlProtocols );
		state.tokenize = this.eatFreeExternalLink.bind( this );
		return this.makeLocalStyle( modeConfig.tags.freeExtLinkProtocol, state );
	}

	eatFreeExternalLink( stream: StringStream, state: State ): string {
		if ( stream.eol() ) {
			// @todo error message
		} else if ( stream.match( /^[^\s{[\]<>~).,']*/ ) ) {
			if ( stream.peek() === '~' ) {
				if ( !stream.match( /^~{3,}/, false ) ) {
					stream.match( /^~*/ );
					return this.makeLocalStyle( modeConfig.tags.freeExtLink, state );
				}
			} else if ( stream.peek() === '{' ) {
				if ( !stream.match( '{{', false ) ) {
					stream.next();
					return this.makeLocalStyle( modeConfig.tags.freeExtLink, state );
				}
			} else if ( stream.peek() === '\'' ) {
				if ( !stream.match( '\'\'', false ) ) {
					stream.next();
					return this.makeLocalStyle( modeConfig.tags.freeExtLink, state );
				}
			} else if ( stream.match( /^[).,]+(?=[^\s{[\]<>~).,])/ ) ) {
				return this.makeLocalStyle( modeConfig.tags.freeExtLink, state );
			}
		}
		state.tokenize = state.stack.pop()!;
		return this.makeLocalStyle( modeConfig.tags.freeExtLink, state );
	}

	eatWikiText( style: string, mnemonicStyle: string ) {
		return ( stream: StringStream, state: State ): string => {
			let ch: string | void, // eslint-disable-line @typescript-eslint/no-invalid-void-type
				tmp: RegExpMatchArray | number | null,
				mt: RegExpMatchArray | null,
				name: RegExpMatchArray | null,
				isCloseTag = false,
				tagname: RegExpMatchArray | string | null;
			const sol = stream.sol();

			const chain = ( parser: Tokenizer ): string => {
				state.stack.push( state.tokenize );
				state.tokenize = parser;
				return parser( stream, state );
			};

			if ( sol ) {
				// highlight free external links, see T108448
				if ( !stream.match( '//', false ) && stream.match( this.urlProtocols ) ) {
					state.stack.push( state.tokenize );
					state.tokenize = this.eatFreeExternalLink.bind( this );
					return this.makeLocalStyle( modeConfig.tags.freeExtLinkProtocol, state );
				}
				ch = stream.next();
				switch ( ch ) {
					case '-':
						if ( stream.match( /^-{3,}/ ) ) {
							return modeConfig.tags.hr;
						}
						break;
					case '=':
						tmp = stream.match(
							/^(={0,5})(.+?(=\1\s*)(<!--(?!.*-->.*\S).*)?)$/
						) as RegExpMatchArray | null;
						// Title
						if ( tmp ) {
							stream.backUp( tmp[ 2 ]!.length );
							state.stack.push( state.tokenize );
							state.tokenize = this.eatSectionHeader( tmp[ 3 ]!.length );
							return modeConfig.tags.sectionHeader + ' '

								/**
								 * Tokens used here include:
								 * - cm-mw-section-1
								 * - cm-mw-section-2
								 * - cm-mw-section-3
								 * - cm-mw-section-4
								 * - cm-mw-section-5
								 * - cm-mw-section-6
								 */
								+ ( modeConfig.tags as Record<string, string> )[
									`sectionHeader${ tmp[ 1 ]!.length + 1 }`
								];
						}
						break;
					case '*':
					case '#':
						// Just consume all nested list and indention syntax when there is more
						stream.match( /^[*#]*:*/ );
						return modeConfig.tags.list;
					case ':':
						// Highlight indented tables :{|, bug T108454
						if ( stream.match( /^:*\{\|/, false ) ) {
							state.stack.push( state.tokenize );
							state.tokenize = this.eatStartTable.bind( this );
						}
						// Just consume all nested list and indention syntax when there is more
						stream.match( /^:*[*#]*/ );
						return modeConfig.tags.indenting;
					case ' ':
						// Leading spaces is valid syntax for tables, bug T108454
						if ( stream.match( /^\s*:*\{\|/, false ) ) {
							stream.eatSpace();
							if ( stream.match( /^:+/ ) ) { // ::{|
								state.stack.push( state.tokenize );
								state.tokenize = this.eatStartTable.bind( this );
								return modeConfig.tags.indenting;
							}
							stream.eat( '{' );
						} else {
							return modeConfig.tags.skipFormatting;
						}
					// break is not necessary here
					// falls through
					case '{':
						if ( stream.eat( '|' ) ) {
							stream.eatSpace();
							state.stack.push( state.tokenize );
							state.tokenize = this.inTableDefinition.bind( this );
							return modeConfig.tags.tableBracket;
						}
						break;
					default:
						// pass
				}
			} else {
				ch = stream.next();
			}

			switch ( ch ) {
				case '&':
					return this.makeStyle(
						this.eatMnemonic( stream, style, mnemonicStyle ),
						state
					);
				case '\'':
					// skip the irrelevant apostrophes ( >5 or =4 )
					if ( stream.match( /^'*(?='{5})/ ) || stream.match( /^'''(?!')/, false ) ) {
						break;
					}
					if ( stream.match( '\'\'' ) ) { // bold
						if ( !( this.firstSingleLetterWord || stream.match( '\'\'', false ) ) ) {
							this.prepareItalicForCorrection( stream );
						}
						this.isBold = !this.isBold;
						return this.makeLocalStyle( modeConfig.tags.apostrophesBold, state );
					} else if ( stream.eat( '\'' ) ) { // italic
						this.isItalic = !this.isItalic;
						return this.makeLocalStyle( modeConfig.tags.apostrophesItalic, state );
					}
					break;
				case '[':
					if ( stream.eat( '[' ) ) { // Link Example: [[ Foo | Bar ]]
						stream.eatSpace();
						if ( /[^\]|[]/.test( stream.peek() || '' ) ) {
							state.nLink++;
							state.stack.push( state.tokenize );
							state.tokenize = this.inLink.bind( this );
							return this.makeLocalStyle( modeConfig.tags.linkBracket, state );
						}
					} else {
						mt = stream.match( this.urlProtocols ) as RegExpMatchArray | null;
						if ( mt ) {
							state.nLink++;
							stream.backUp( mt[ 0 ].length );
							state.stack.push( state.tokenize );
							state.tokenize = this.eatExternalLinkProtocol( mt[ 0 ].length );
							return this.makeLocalStyle( modeConfig.tags.extLinkBracket, state );
						}
					}
					break;
				case '{':
					// Template parameter (T108450 - skip parameters within template transclusions)
					if ( !stream.match( '{{{{', false ) && stream.match( '{{' ) ) {
						stream.eatSpace();
						state.stack.push( state.tokenize );
						state.tokenize = this.inVariable.bind( this );
						return this.makeLocalStyle(
							modeConfig.tags.templateVariableBracket,
							state
						);
					} else if ( stream.match( /^\{\s*/ ) ) {
						if ( stream.peek() === '#' ) { // Parser function
							state.nExt++;
							state.stack.push( state.tokenize );
							state.tokenize = this.inParserFunctionName.bind( this );
							return this.makeLocalStyle(
								modeConfig.tags.parserFunctionBracket,
								state
							);
						}
						// Check for parser function without '#'
						name = stream.match( /^([^\s}[\]<{'|&:]+)(:|\s*)(\}\}?)?(.)?/ ) as RegExpMatchArray | null;
						if ( name ) {
							stream.backUp( name[ 0 ].length );
							if (
								( name[ 2 ] === ':' || name[ 4 ] === undefined || name[ 3 ] === '}}' )
								&& (
									name[ 1 ]!.toLowerCase() in this.config.functionSynonyms[ 0 ]
									|| name[ 1 ]! in this.config.functionSynonyms[ 1 ]
								)
							) {
								state.nExt++;
								state.stack.push( state.tokenize );
								state.tokenize = this.inParserFunctionName.bind( this );
								return this.makeLocalStyle(
									modeConfig.tags.parserFunctionBracket,
									state
								);
							}
						}
						// Template
						state.nTemplate++;
						state.stack.push( state.tokenize );
						state.tokenize = this.eatTemplatePageName( false );
						return this.makeLocalStyle( modeConfig.tags.templateBracket, state );
					}
					break;
				case '<':
					isCloseTag = Boolean( stream.eat( '/' ) );
					tagname = stream.match( /^[^>/\s.*,[\]{}$^+?|\\'`~<=!@#%&()-]+/ ) as RegExpMatchArray | null;
					if ( stream.match( '!--' ) ) { // comment
						return chain( this.eatBlock( modeConfig.tags.comment, '-->' ) );
					}
					if ( tagname ) {
						tagname = tagname[ 0 ]!.toLowerCase();
						// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
						if ( this.config.tags && tagname in this.config.tags ) {
							// Parser function
							if ( isCloseTag ) {
								return modeConfig.tags.error;
							}
							stream.backUp( tagname.length );
							state.stack.push( state.tokenize );
							state.tokenize = this.eatTagName( tagname.length, isCloseTag, false );
							return this.makeLocalStyle( 'mw-exttag-bracket mw-ext-' + tagname, state );
						}
						if ( tagname in modeConfig.permittedHtmlTags ) {
							// Html tag
							if ( isCloseTag && tagname !== state.inHtmlTag.pop() ) {
								stream.pos++;
								return modeConfig.tags.error;
							}
							if (
								isCloseTag
								&& tagname in modeConfig.implicitlyClosedHtmlTags
							) {
								return modeConfig.tags.error;
							}
							stream.backUp( tagname.length );
							state.stack.push( state.tokenize );
							state.tokenize = this.eatTagName(
								tagname.length,
								// Opening void tags should also be treated as the closing tag.
								isCloseTag
									|| tagname in modeConfig.implicitlyClosedHtmlTags,
								true
							);
							return this.makeLocalStyle( modeConfig.tags.htmlTagBracket, state );
						}
						stream.backUp( tagname.length );
					}
					break;
				case '~':
					if ( stream.match( /^~{2,4}/ ) ) {
						return modeConfig.tags.signature;
					}
					break;
				// Maybe double underscored Magic Word such as __TOC__
				case '_':
					tmp = 1;
					// Optimize processing of many underscore symbols
					while ( stream.eat( '_' ) ) {
						tmp++;
					}
					// Many underscore symbols
					if ( tmp > 2 ) {
						if ( !stream.eol() ) {
							// Leave last two underscore symbols for processing in next iteration
							stream.backUp( 2 );
						}
						// Optimization: skip regex function for EOL and backup-ed symbols
						return this.makeStyle( style, state );
					// Check on double underscore Magic Word
					} else if ( tmp === 2 ) {
						// The same as the end of function except '_' inside and '__' at the end.
						name = stream.match( /^([^\s>}[\]<{'|&:~]+?)__/ ) as RegExpMatchArray | null;
						if ( name && name[ 0 ] ) {
							if (
								'__' + name[ 0 ].toLowerCase() in this.config.doubleUnderscore[ 0 ]
								|| '__' + name[ 0 ] in this.config.doubleUnderscore[ 1 ]
							) {
								return modeConfig.tags.doubleUnderscore;
							}
							if ( !stream.eol() ) {
								// Two underscore symbols at the end can be the
								// beginning of another double underscored Magic Word
								stream.backUp( 2 );
							}
							// Optimization: skip regex for EOL and backup-ed symbols
							return this.makeStyle( style, state );
						}
					}
					break;
				default:
					if ( /\s/.test( ch || '' ) ) {
						stream.eatSpace();
						// highlight free external links, bug T108448
						if ( stream.match( this.urlProtocols, false ) && !stream.match( '//' ) ) {
							state.stack.push( state.tokenize );
							state.tokenize = this.eatFreeExternalLinkProtocol.bind( this );
							return this.makeStyle( style, state );
						}
					}
					break;
			}
			stream.match( /^[^\s_>}[\]<{'|&:~=]+/ );
			return this.makeStyle( style, state );
		};
	}

	/**
	 * Remembers position and status for rollbacking.
	 * It is needed for changing from bold to italic with apostrophes before it, if required.
	 *
	 * @see https://phabricator.wikimedia.org/T108455
	 */
	prepareItalicForCorrection( stream: StringStream ): void {
		// See Parser::doQuotes() in MediaWiki Core, it works similarly.
		// this.firstSingleLetterWord has maximum priority
		// this.firstMultiLetterWord has medium priority
		// this.firstSpace has low priority
		const end = stream.pos,
			str = stream.string.slice( 0, end - 3 ),
			x1 = str.slice( -1, -1 + 1 ),
			x2 = str.slice( -2, -2 + 1 );

		// this.firstSingleLetterWord always is undefined here
		if ( x1 === ' ' ) {
			if ( this.firstMultiLetterWord || this.firstSpace ) {
				return;
			}
			this.firstSpace = end;
		} else if ( x2 === ' ' ) {
			this.firstSingleLetterWord = end;
		} else if ( this.firstMultiLetterWord ) {
			return;
		} else {
			this.firstMultiLetterWord = end;
		}
		// remember bold and italic state for later restoration
		this.wasBold = this.isBold;
		this.wasItalic = this.isItalic;
	}

	/**
	 * @see https://codemirror.net/docs/ref/#language.StreamParser
	 */
	get mediawiki(): StreamParser<unknown> {
		return {
			name: 'mediawiki',

			/**
			 * Initial State for the parser.
			 */
			startState: (): State => ( {
				tokenize: this.eatWikiText( '', '' ),
				stack: [],
				inHtmlTag: [],
				extName: false,
				extMode: false,
				extState: false,
				nTemplate: 0,
				nLink: 0,
				nExt: 0
			} ),

			/**
			 * Copies the given state.
			 */
			copyState: ( state: State ): State => ( {
				tokenize: state.tokenize,
				stack: [
					...state.stack
				],
				inHtmlTag: [
					...state.inHtmlTag
				],
				extName: state.extName,
				extMode: state.extMode,
				extState: state.extMode !== false && ( state.extMode.copyState!( state.extState ) as State ),
				nTemplate: state.nTemplate,
				nLink: state.nLink,
				nExt: state.nExt
			} ),

			/**
			 * Reads one token, advancing the stream past it,
			 * and returning a string indicating the token's style tag.
			 */
			token: ( stream: StringStream, state: State ): string => {
				let style: string,
					p: number | null = null,
					t: Token,
					f: number | null,
					tmpTokens: Token[] = [];
				const readyTokens: Token[] = [];

				if ( this.oldTokens.length > 0 ) {
					// just send saved tokens till they exists
					t = this.oldTokens.shift()!;
					stream.pos = t.pos;
					return t.style;
				}

				if ( stream.sol() ) {
					// reset bold and italic status in every new line
					this.isBold = false;
					this.isItalic = false;
					this.firstSingleLetterWord = null;
					this.firstMultiLetterWord = null;
					this.firstSpace = null;
				}

				do {
					// get token style
					style = state.tokenize( stream, state );
					f = this.firstSingleLetterWord || this.firstMultiLetterWord || this.firstSpace;
					if ( f ) {
						// rollback point exists
						if ( f !== p ) {
							// new rollback point
							p = f;
							// it's not first rollback point
							if ( tmpTokens.length > 0 ) {
								// save tokens
								readyTokens.push( ...tmpTokens );
								tmpTokens = [];
							}
						}
						// save token
						tmpTokens.push( {
							pos: stream.pos,
							style,
							state: state.extMode ? ( state.extMode.copyState!( state ) as State ) : 'mediawiki'
						} );
					} else {
						// rollback point does not exist
						// remember style before possible rollback point
						this.oldStyle = style;
						// just return token style
						return style;
					}
				} while ( !stream.eol() );

				if ( this.isBold && this.isItalic ) {
					// needs to rollback
					// restore status
					this.isItalic = this.wasItalic;
					this.isBold = this.wasBold;
					this.firstSingleLetterWord = null;
					this.firstMultiLetterWord = null;
					this.firstSpace = null;
					if ( readyTokens.length > 0 ) {
						// it contains tickets before the point of rollback
						// add one apostrophe, next token will be italic (two apostrophes)
						readyTokens[ readyTokens.length - 1 ]!.pos++;
						// for sending tokens till the point of rollback
						this.oldTokens = readyTokens;
					} else {
						// there are no tickets before the point of rollback
						stream.pos = tmpTokens[ 0 ]!.pos - 2; // eat( '\'')
						// send saved Style
						return this.oldStyle || '';
					}
				} else {
					// do not need to rollback
					// send all saved tokens
					this.oldTokens = [
						...readyTokens,
						...tmpTokens
					];
				}
				// return first saved token
				t = this.oldTokens.shift()!;
				stream.pos = t.pos;
				return t.style;
			},

			// FIXME: This is non-functional and still needs to be ported to CM6, see T348684
			blankLine: ( state: State ): string => {
				let ret: string;
				if ( state.extName ) {
					if ( state.extMode ) {
						ret = '';
						if ( state.extMode.blankLine ) {
							// eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
							ret = ' ' + ( state.extMode.blankLine( state.extState, 0 ) as unknown as string );
						}
						return 'line-cm-mw-tag-' + state.extName + ret;
					}
					return 'line-cm-mw-exttag';
				}
				return '';
			},

			/**
			 * Extra tokens to use in this parser.
			 *
			 * @see CodeMirrorConfigChanges.tokenTable
			 */
			tokenTable: modeConfig.tokenTable
		};
	}
}

/**
 * Gets a LanguageSupport instance for the MediaWiki mode.
 */
export const mediaWikiLang = ( config: MwConfig ): LanguageSupport => {
	const parser = new CodeMirrorModeMediaWiki(
		config
	).mediawiki;
	const lang = StreamLanguage.define( parser );
	const highlighter = syntaxHighlighting( modeConfig.getHighlightStyle( parser ) as Highlighter );
	return new LanguageSupport( lang, highlighter );
};
