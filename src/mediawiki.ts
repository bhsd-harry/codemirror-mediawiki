/**
 * @author pastakhov, MusikAnimal and others
 * @license GPL-2.0-or-later
 * @link https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {HighlightStyle, LanguageSupport, StreamLanguage, syntaxHighlighting} from '@codemirror/language';
import {Tag} from '@lezer/highlight';
import {modeConfig} from './config';
import * as plugins from './plugins';
import type {StreamParser, StringStream, TagStyle} from '@codemirror/language';
import type {Highlighter} from '@lezer/highlight';

declare type MimeTypes = 'mediawiki' | 'text/mediawiki';

declare type Tokenizer = (stream: StringStream, state: State) => string;

declare interface State {
	tokenize: Tokenizer;
	readonly stack: Tokenizer[];
	readonly inHtmlTag: string[];
	extName: string | false;
	extMode: StreamParser<object> | false;
	extState: object | false;
	nTemplate: number;
	nLink: number;
	nExt: number;
	lpar: boolean;
	lbrack: boolean;
}

declare interface Token {
	pos: number;
	readonly style: string;
	readonly state: object;
}

export interface MwConfig {
	readonly urlProtocols: string;
	readonly tags: Record<string, true>;
	readonly tagModes: Record<string, string>;
	functionSynonyms: [Record<string, string>, Record<string, unknown>];
	doubleUnderscore: [Record<string, unknown>, Record<string, unknown>];
	variants?: string[];
	img?: Record<string, string>;
	nsid: Record<string, number>;
}

const copyState = (state: State): State => {
	const newState = {} as State;
	for (const [key, val] of Object.entries(state)) {
		Object.assign(newState, {[key]: Array.isArray(val) ? [...val] : val});
	}
	return newState;
};

const span = document.createElement('span'); // used for isHtmlEntity()

const isHtmlEntity = (str: string): boolean => {
	span.innerHTML = str;
	return [...span.textContent!].length === 1;
};

/**
 * Adapted from the original CodeMirror 5 stream parser by Pavel Astakhov
 */
class MediaWiki {
	declare readonly config: MwConfig;
	declare readonly urlProtocols: RegExp;
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
	declare tokenTable: Record<string, Tag>;

	constructor(config: MwConfig) {
		this.config = config;
		this.urlProtocols = new RegExp(`^(?:${config.urlProtocols})`, 'iu');
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
		this.tokenTable = {...modeConfig.tokenTable};

		// Dynamically register any tags that aren't already in CodeMirrorModeMediaWikiConfig
		for (const tag of Object.keys(config.tags)) {
			this.addTag(tag);
		}
	}

	/**
	 * Create RegExp for file links
	 * @internal
	 */
	get fileRegex(): RegExp {
		const nsFile = Object.entries(this.config.nsid).filter(([, id]) => id === 6).map(([ns]) => ns).join('|');
		return new RegExp(`^\\s*(?:${nsFile})\\s*:\\s*`, 'iu');
	}

	/**
	 * Register a tag in CodeMirror. The generated CSS class will be of the form 'cm-mw-tag-tagname'
	 * This is for internal use to dynamically register tags from other MediaWiki extensions.
	 *
	 * @see https://www.mediawiki.org/wiki/Extension:CodeMirror#Extension_integration
	 * @param tag
	 * @param parent
	 * @internal
	 */
	addTag(tag: string, parent?: Tag): void {
		(this.tokenTable[`mw-tag-${tag}`] as Tag | undefined) ||= Tag.define(parent);
	}

	/**
	 * This defines the actual CSS class assigned to each tag/token.
	 *
	 * @see https://codemirror.net/docs/ref/#language.TagStyle
	 */
	getTagStyles(): TagStyle[] {
		return Object.keys(this.tokenTable).map(className => ({
			tag: this.tokenTable[className]!,
			class: `cm-${className}${className === 'templateName' ? ' cm-mw-pagename' : ''}`,
		}));
	}

	eatHtmlEntity(stream: StringStream, style: string): string { // eslint-disable-line class-methods-use-this
		const entity = stream.match(/^(?:#x[a-f\d]+|#\d+|[a-z\d]+);/iu) as RegExpMatchArray | false;
		return entity && isHtmlEntity(`&${entity[0]}`) ? modeConfig.tags.htmlEntity : style;
	}

	makeStyle(style: string, state: State, endGround?: 'nTemplate' | 'nLink' | 'nExt'): string {
		return this.makeLocalStyle(
			`${style} ${this.isBold ? modeConfig.tags.strong : ''} ${this.isItalic ? modeConfig.tags.em : ''}`,
			state,
			endGround,
		);
	}

	// eslint-disable-next-line class-methods-use-this
	makeLocalStyle(style: string, state: State, endGround?: 'nTemplate' | 'nLink' | 'nExt'): string {
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
		 * NOTE: these should be defined in modeConfig.tokenTable()
		 *   and modeConfig.highlightStyle()
		 */
		switch (state.nTemplate) {
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
		switch (state.nExt) {
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
		if (state.nLink > 0) {
			ground += '-link';
		}
		if (endGround) {
			state[endGround]--;
		}
		return (ground && `mw${ground}-ground `) + style;
	}

	inBlock(style: string, terminator: string, consumeLast = true): Tokenizer {
		return (stream, state) => {
			if (stream.skipTo(terminator)) {
				if (consumeLast) {
					stream.match(terminator);
				}
				state.tokenize = state.stack.pop()!;
			} else {
				stream.skipToEnd();
			}
			return this.makeLocalStyle(style, state);
		};
	}

	eatEnd(style: string): Tokenizer {
		return (stream, state) => {
			stream.skipToEnd();
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle(style, state);
		};
	}

	inChar(char: string, style: string): Tokenizer {
		return (stream, state) => {
			if (stream.eat(char)) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle(style, state);
			} else if (!stream.skipTo(char)) {
				stream.skipToEnd();
			}
			return this.makeLocalStyle(modeConfig.tags.error, state);
		};
	}

	inSectionHeader(count: number): Tokenizer {
		return (stream, state) => {
			if (stream.match(/^[^&<[{~']+/u)) {
				if (stream.eol()) {
					stream.backUp(count);
					state.tokenize = this.eatEnd(modeConfig.tags.sectionHeader);
				} else if (stream.match(/^<!--(?!.*?-->.*?=)/u, false)) {
					// T171074: handle trailing comments
					stream.backUp(count);
					state.tokenize = this.inBlock(modeConfig.tags.sectionHeader, '<!--', false);
				}
				return this.makeLocalStyle(modeConfig.tags.section, state);
			}
			return this.eatWikiText(modeConfig.tags.section)(stream, state);
		};
	}

	inVariable(stream: StringStream, state: State): string {
		if (stream.match(/^[^{}|]+/u)) {
			return this.makeLocalStyle(modeConfig.tags.templateVariableName, state);
		} else if (stream.eat('|')) {
			state.tokenize = this.inVariableDefault.bind(this);
			return this.makeLocalStyle(modeConfig.tags.templateVariableDelimiter, state);
		} else if (stream.match('}}}')) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle(modeConfig.tags.templateVariableBracket, state);
		} else if (stream.match('{{{')) {
			state.stack.push(state.tokenize);
			return this.makeLocalStyle(modeConfig.tags.templateVariableBracket, state);
		}
		stream.next();
		return this.makeLocalStyle(modeConfig.tags.templateVariableName, state);
	}

	inVariableDefault(stream: StringStream, state: State): string {
		if (stream.match(/^[^{}[<&~]+/u)) {
			return this.makeStyle(modeConfig.tags.templateVariable, state);
		} else if (stream.match('}}}')) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle(modeConfig.tags.templateVariableBracket, state);
		}
		return this.eatWikiText(modeConfig.tags.templateVariable)(stream, state);
	}

	inParserFunctionName(stream: StringStream, state: State): string {
		// FIXME: {{#name}} and {{uc}} are wrong, must have ':'
		if (stream.match(/^[^:}{~|<>[\]]+/u)) {
			return this.makeLocalStyle(modeConfig.tags.parserFunctionName, state);
		} else if (stream.eat(':')) {
			state.tokenize = this.inParserFunctionArguments.bind(this);
			return this.makeLocalStyle(modeConfig.tags.parserFunctionDelimiter, state);
		} else if (stream.match('}}')) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle(modeConfig.tags.parserFunctionBracket, state, 'nExt');
		}
		return this.eatWikiText(modeConfig.tags.error)(stream, state);
	}

	inParserFunctionArguments(stream: StringStream, state: State): string {
		if (stream.match(/^[^|}{[<&~]+/u)) {
			return this.makeLocalStyle(modeConfig.tags.parserFunction, state);
		} else if (stream.eat('|')) {
			return this.makeLocalStyle(modeConfig.tags.parserFunctionDelimiter, state);
		} else if (stream.match('}}')) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle(modeConfig.tags.parserFunctionBracket, state, 'nExt');
		}
		return this.eatWikiText(modeConfig.tags.parserFunction)(stream, state);
	}

	inTemplatePageName(haveAte: boolean): Tokenizer {
		return (stream, state) => {
			if (stream.match(/^\s*\|\s*/u)) {
				state.tokenize = this.inTemplateArgument(true);
				return this.makeLocalStyle(modeConfig.tags.templateDelimiter, state);
			} else if (stream.match(/^\s*\}\}/u)) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle(modeConfig.tags.templateBracket, state, 'nTemplate');
			} else if (stream.match(/^\s*<!--.*?-->/u)) {
				return this.makeLocalStyle(modeConfig.tags.comment, state);
			} else if (haveAte && stream.sol()) {
				// @todo error message
				state.nTemplate--;
				state.tokenize = state.stack.pop()!;
				return '';
			} else if (stream.match(/^\s*[^\s|&~{}<>[\]]+/u)) {
				state.tokenize = this.inTemplatePageName(true);
				return this.makeLocalStyle(modeConfig.tags.templateName, state);
			} else if (stream.match(/^(?:[<>[\]}]|\{(?!\{))/u)) {
				return this.makeLocalStyle(modeConfig.tags.error, state);
			}
			return stream.eatSpace()
				? this.makeLocalStyle(modeConfig.tags.templateName, state)
				: this.eatWikiText(modeConfig.tags.templateName)(stream, state);
		};
	}

	inTemplateArgument(expectArgName: boolean): Tokenizer {
		return (stream, state) => {
			if (expectArgName && stream.eatWhile(/[^=|}{[<&~]/u)) {
				if (stream.eat('=')) {
					state.tokenize = this.inTemplateArgument(false);
					return this.makeLocalStyle(modeConfig.tags.templateArgumentName, state);
				}
				return this.makeLocalStyle(modeConfig.tags.template, state);
			} else if (stream.eatWhile(/[^|}{[<&~]/u)) {
				return this.makeLocalStyle(modeConfig.tags.template, state);
			} else if (stream.eat('|')) {
				state.tokenize = this.inTemplateArgument(true);
				return this.makeLocalStyle(modeConfig.tags.templateDelimiter, state);
			} else if (stream.match('}}')) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle(modeConfig.tags.templateBracket, state, 'nTemplate');
			}
			return this.eatWikiText(modeConfig.tags.template)(stream, state);
		};
	}

	eatExternalLinkProtocol(chars: number): Tokenizer {
		return (stream, state) => {
			for (let i = 0; i < chars; i++) {
				stream.next();
			}
			if (stream.eol()) {
				state.nLink--;
				// @todo error message
				state.tokenize = state.stack.pop()!;
			} else {
				state.tokenize = this.inExternalLink.bind(this);
			}
			return this.makeLocalStyle(modeConfig.tags.extLinkProtocol, state);
		};
	}

	inExternalLink(stream: StringStream, state: State): string {
		if (stream.sol()) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop()!;
			return '';
		} else if (stream.match(/^\s*\]/u)) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle(modeConfig.tags.extLinkBracket, state, 'nLink');
		} else if (stream.eatSpace()) {
			state.tokenize = this.inExternalLinkText.bind(this);
			return this.makeLocalStyle('', state);
		} else if (stream.match(/^[^\s\]{&~']+/u)) {
			if (stream.peek() === "'") {
				if (stream.match("''", false)) {
					state.tokenize = this.inExternalLinkText.bind(this);
				} else {
					stream.next();
				}
			}
			return this.makeLocalStyle(modeConfig.tags.extLink, state);
		}
		return this.eatWikiText(modeConfig.tags.extLink)(stream, state);
	}

	inExternalLinkText(stream: StringStream, state: State): string {
		if (stream.sol()) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop()!;
			return '';
		} else if (stream.eat(']')) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalStyle(modeConfig.tags.extLinkBracket, state, 'nLink');
		}
		return stream.match(/^[^'\]{&~<]+/u)
			? this.makeStyle(modeConfig.tags.extLinkText, state)
			: this.eatWikiText(modeConfig.tags.extLinkText)(stream, state);
	}

	inLink(file: boolean): Tokenizer {
		return (stream, state) => {
			if (stream.sol()) {
				state.nLink--;
				// @todo error message
				state.tokenize = state.stack.pop()!;
				return '';
			} else if (stream.match(/^\s*#\s*/u)) {
				state.tokenize = this.inLinkToSection(file);
				return this.makeStyle(modeConfig.tags.link, state);
			} else if (stream.match(/^\s*\|\s*/u)) {
				state.tokenize = this.inLinkText(file);
				return this.makeLocalStyle(modeConfig.tags.linkDelimiter, state);
			} else if (stream.match(/^\s*\]\]/u)) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle(modeConfig.tags.linkBracket, state, 'nLink');
			} else if (stream.match(/^(?:[<>[\]}]|\{(?!\{))/u)) {
				return this.makeStyle(modeConfig.tags.error, state);
			}
			const style = `${modeConfig.tags.linkPageName} ${modeConfig.tags.pageName}`;
			return stream.match(/^[^#|[\]&~{}<>]+/u)
				? this.makeStyle(style, state)
				: this.eatWikiText(style)(stream, state);
		};
	}

	inLinkToSection(file: boolean): Tokenizer {
		return (stream, state) => {
			if (stream.sol()) {
				// @todo error message
				state.nLink--;
				state.tokenize = state.stack.pop()!;
				return '';
			}
			// FIXME '{{' breaks links, example: [[z{{page]]
			if (stream.match(/^[^|\]&~{}]+/u)) {
				return this.makeStyle(modeConfig.tags.linkToSection, state);
			} else if (stream.eat('|')) {
				state.tokenize = this.inLinkText(file);
				return this.makeLocalStyle(modeConfig.tags.linkDelimiter, state);
			} else if (stream.match(']]')) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle(modeConfig.tags.linkBracket, state, 'nLink');
			}
			return this.eatWikiText(modeConfig.tags.linkToSection)(stream, state);
		};
	}

	inLinkText(file: boolean): Tokenizer {
		let linkIsBold: boolean,
			linkIsItalic: boolean;

		return (stream, state) => {
			const tmpstyle = `${modeConfig.tags.linkText} ${linkIsBold ? modeConfig.tags.strong : ''} ${
				linkIsItalic ? modeConfig.tags.em : ''
			}`;
			if (stream.match(']]')) {
				if (state.lbrack && stream.peek() === ']') {
					stream.backUp(1);
					state.lbrack = false;
					return this.makeStyle(tmpstyle, state);
				}
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle(modeConfig.tags.linkBracket, state, 'nLink');
			} else if (file && stream.eat('|')) {
				return this.makeLocalStyle(modeConfig.tags.linkDelimiter, state);
			} else if (stream.match("'''")) {
				linkIsBold = !linkIsBold;
				return this.makeLocalStyle(`${modeConfig.tags.linkText} ${modeConfig.tags.apostrophes}`, state);
			} else if (stream.match("''")) {
				linkIsItalic = !linkIsItalic;
				return this.makeLocalStyle(`${modeConfig.tags.linkText} ${modeConfig.tags.apostrophes}`, state);
			}
			const mt = stream
				.match(file ? /^(?:[^'\]{&~<|[]|\[(?!\[))+/u : /^[^'\]{&~<]+/u) as RegExpMatchArray | false;
			if (mt && mt[0].includes('[')) {
				state.lbrack = true;
			}
			return mt ? this.makeStyle(tmpstyle, state) : this.eatWikiText(tmpstyle)(stream, state);
		};
	}

	eatTagName(chars: number, isCloseTag: boolean, isHtmlTag: boolean): Tokenizer {
		return (stream, state) => {
			let name = '';
			for (let i = 0; i < chars; i++) {
				name += stream.next();
			}
			stream.eatSpace();
			name = name.toLowerCase();

			if (isHtmlTag) {
				state.tokenize = isCloseTag
					? this.inChar('>', modeConfig.tags.htmlTagBracket)
					: this.inHtmlTagAttribute(name);
				return this.makeLocalStyle(modeConfig.tags.htmlTagName, state);
			}
			// it is the extension tag
			state.tokenize = isCloseTag
				? this.inChar('>', modeConfig.tags.extTagBracket)
				: this.inExtTagAttribute(name);
			return this.makeLocalStyle(modeConfig.tags.extTagName, state);
		};
	}

	inHtmlTagAttribute(name: string): Tokenizer {
		return (stream, state) => {
			if (stream.match(/^[^>/<{]+/u)) {
				return this.makeLocalStyle(modeConfig.tags.htmlTagAttribute, state);
			} else if (stream.match(/^\/?>/u)) {
				if (!modeConfig.implicitlyClosedHtmlTags.has(name)) {
					state.inHtmlTag.push(name);
				}
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle(modeConfig.tags.htmlTagBracket, state);
			}
			return this.eatWikiText(modeConfig.tags.htmlTagAttribute)(stream, state);
		};
	}

	eatNowiki(): Tokenizer {
		return stream => {
			if (stream.match(/^[^&]+/u)) {
				return '';
			}
			// eat &
			stream.next();
			return this.eatHtmlEntity(stream, '');
		};
	}

	inExtTagAttribute(name: string): Tokenizer {
		return (stream, state) => {
			if (stream.match(/^[^>/]+/u)) {
				return this.makeLocalStyle(modeConfig.tags.extTagAttribute, state);
			} else if (stream.eat('>')) {
				state.extName = name;
				// leverage the tagModes system for <nowiki> and <pre>
				if (name === 'nowiki' || name === 'pre') {
					// There's no actual processing within these tags (apart from HTML entities),
					// so startState and copyState can be no-ops.
					state.extMode = {
						startState: () => ({}),
						token: this.eatNowiki(),
					};
					state.extState = {};
				} else if (name in this.config.tagModes) {
					state.extMode = this[this.config.tagModes[name] as MimeTypes];
					state.extState = state.extMode.startState!(0);
				}

				state.tokenize = this.eatExtTagArea(name);
				return this.makeLocalStyle(modeConfig.tags.extTagBracket, state);
			} else if (stream.match('/>')) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalStyle(modeConfig.tags.extTagBracket, state);
			}
			return this.eatWikiText(modeConfig.tags.extTagAttribute)(stream, state);
		};
	}

	eatExtTagArea(name: string): Tokenizer {
		return (stream, state) => {
			const from = stream.pos,
				pattern = new RegExp(`</${name}(?:[\\s>]|$)`, 'iu'),
				m = pattern.exec(from ? stream.string.slice(from) : stream.string);
			let origString: string | false = false;

			if (m) {
				if (m.index === 0) {
					state.tokenize = this.eatExtCloseTag(name);
					state.extName = false;
					if (state.extMode) {
						state.extMode = false;
						state.extState = false;
					}
					return state.tokenize(stream, state);
				}
				const to = m.index + from;
				origString = stream.string;
				stream.string = origString.slice(0, to);
			}

			state.stack.push(state.tokenize);
			state.tokenize = this.inExtTokens(origString);
			return state.tokenize(stream, state);
		};
	}

	eatExtCloseTag(name: string): Tokenizer {
		return (stream, state) => {
			stream.next(); // eat <
			stream.next(); // eat /
			state.tokenize = this.eatTagName(name.length, true, false);
			return this.makeLocalStyle(modeConfig.tags.extTagBracket, state);
		};
	}

	inExtTokens(origString: string | false): Tokenizer { // eslint-disable-line class-methods-use-this
		return (stream, state) => {
			let ret: string;
			if (state.extMode === false) {
				ret = modeConfig.tags.extTag;
				stream.skipToEnd();
			} else {
				ret = `mw-tag-${state.extName} ${state.extMode.token(stream, state.extState as State)}`;
			}
			if (stream.eol()) {
				if (origString !== false) {
					stream.string = origString;
				}
				state.tokenize = state.stack.pop()!;
			}
			return ret;
		};
	}

	eatStartTable(stream: StringStream, state: State): string {
		stream.match(/^(?:\{\||\{{3}\s*!\s*\}\})\s*/u);
		state.tokenize = this.inTableDefinition.bind(this);
		return this.makeLocalStyle(modeConfig.tags.tableBracket, state);
	}

	inTableDefinition(stream: StringStream, state: State): string {
		if (stream.sol()) {
			state.tokenize = this.inTable.bind(this);
			return this.inTable(stream, state);
		}
		return this.eatWikiText(modeConfig.tags.tableDefinition)(stream, state);
	}

	inTableCaption(stream: StringStream, state: State): string {
		if (stream.sol() && stream.match(/^\s*(?:[|!]|\{\{\s*!\s*\}\})/u, false)) {
			state.tokenize = this.inTable.bind(this);
			return this.inTable(stream, state);
		}
		return this.eatWikiText(modeConfig.tags.tableCaption)(stream, state);
	}

	inTable(stream: StringStream, state: State): string {
		if (stream.sol()) {
			stream.eatSpace();
			if (stream.match(/^(?:\||\{\{\s*!\s*\}\})/u)) {
				if (stream.match(/^-+\s*/u)) {
					state.tokenize = this.inTableDefinition.bind(this);
					return this.makeLocalStyle(modeConfig.tags.tableDelimiter, state);
				} else if (stream.eat('+')) {
					stream.eatSpace();
					state.tokenize = this.inTableCaption.bind(this);
					return this.makeLocalStyle(modeConfig.tags.tableDelimiter, state);
				} else if (stream.eat('}')) {
					state.tokenize = state.stack.pop()!;
					return this.makeLocalStyle(modeConfig.tags.tableBracket, state);
				}
				stream.eatSpace();
				state.tokenize = this.inTableRow(true, false);
				return this.makeLocalStyle(modeConfig.tags.tableDelimiter, state);
			} else if (stream.eat('!')) {
				stream.eatSpace();
				state.tokenize = this.inTableRow(true, true);
				return this.makeLocalStyle(modeConfig.tags.tableDelimiter, state);
			}
		}
		return this.eatWikiText('')(stream, state);
	}

	inTableRow(isStart: boolean, isHead: boolean): Tokenizer {
		return (stream, state) => {
			if (stream.sol()) {
				if (stream.match(/^\s*(?:[|!]|\{\{\s*!\s*\}\})/u, false)) {
					state.tokenize = this.inTable.bind(this);
					return this.inTable(stream, state);
				}
			} else if (stream.match(/^[^'|{[<&~!]+/u)) {
				return this.makeStyle(isHead ? modeConfig.tags.strong : '', state);
			} else if (
				stream.match(/^(?:\||\{\{\s*!\s*\}\}){2}/u) || isHead && stream.match('!!')
				|| isStart && stream.match(/^(?:\||\{\{\s*!\s*\}\})/u)
			) {
				this.isBold = false;
				this.isItalic = false;
				if (isStart) {
					state.tokenize = this.inTableRow(false, isHead);
				}
				return this.makeLocalStyle(modeConfig.tags.tableDelimiter, state);
			}
			return this.eatWikiText(isHead ? modeConfig.tags.strong : '')(stream, state);
		};
	}

	eatFreeExternalLinkProtocol(stream: StringStream, state: State): string {
		stream.match(this.urlProtocols);
		state.tokenize = this.inFreeExternalLink.bind(this);
		return this.makeStyle(modeConfig.tags.freeExtLinkProtocol, state);
	}

	inFreeExternalLink(stream: StringStream, state: State): string {
		if (stream.eol()) {
			// @todo error message
		} else {
			const mt = stream.match(/^[^\s{[\]<>~).,;:!?'"]*/u) as RegExpMatchArray;
			state.lpar ||= mt[0].includes('(');
			if (stream.peek() === '~') {
				if (stream.match(/^~{1,2}(?!~)/u)) {
					return this.makeStyle(modeConfig.tags.freeExtLink, state);
				}
			} else if (stream.peek() === '{') {
				if (stream.match(/^\{(?!\{)/u)) {
					return this.makeStyle(modeConfig.tags.freeExtLink, state);
				}
			} else if (stream.peek() === "'") {
				if (stream.match(/^'(?!')/u)) {
					return this.makeStyle(modeConfig.tags.freeExtLink, state);
				}
			} else if (state.lpar && stream.peek() === ')') {
				stream.next();
				return this.makeStyle(modeConfig.tags.freeExtLink, state);
			} else if (stream.match(/^[).,;:!?]+(?=[^\s{[\]<>~).,;:!?'"]|~~?(?!~)|\{(?!\{)|'(?!'))/u)) {
				return this.makeStyle(modeConfig.tags.freeExtLink, state);
			}
		}
		state.lpar = false;
		state.tokenize = state.stack.pop()!;
		return this.makeStyle(modeConfig.tags.freeExtLink, state);
	}

	eatWikiText(style: string): Tokenizer {
		return (stream, state) => {
			let ch: string | void; // eslint-disable-line @typescript-eslint/no-invalid-void-type
			const sol = stream.sol();

			if (sol) {
				if (stream.match('//')) {
					return this.makeStyle(style, state);
				// highlight free external links, see T108448
				} else if (stream.match(this.urlProtocols)) {
					state.stack.push(state.tokenize);
					state.tokenize = this.inFreeExternalLink.bind(this);
					return this.makeStyle(modeConfig.tags.freeExtLinkProtocol, state);
				}
				ch = stream.next();
				switch (ch) {
					case '-':
						if (stream.match(/^-{3,}/u)) {
							return modeConfig.tags.hr;
						}
						break;
					case '=': {
						const tmp = stream
							.match(/^(={0,5})(.+?(=\1\s*)(?:<!--(?!.*-->.*\S).*)?)$/u) as RegExpMatchArray | false;
						// Title
						if (tmp) {
							stream.backUp(tmp[2]!.length);
							state.stack.push(state.tokenize);
							state.tokenize = this.inSectionHeader(tmp[3]!.length);
							return this.makeLocalStyle(`${modeConfig.tags.sectionHeader} ${

								/**
								 * Tokens used here include:
								 * - cm-mw-section-1
								 * - cm-mw-section-2
								 * - cm-mw-section-3
								 * - cm-mw-section-4
								 * - cm-mw-section-5
								 * - cm-mw-section-6
								 */
								(modeConfig.tags as Record<string, string>)[`sectionHeader${tmp[1]!.length + 1}`]
							}`, state);
						}
						break;
					}
					case '*':
					case '#':
					case ';':
						// Just consume all nested list and indention syntax when there is more
						stream.match(/^[*#;:]*/u);
						return this.makeLocalStyle(modeConfig.tags.list, state);
					case ':':
						// Highlight indented tables :{|, bug T108454
						if (stream.match(/^:*(?:\{\||\{{3}\s*!\s*\}\})/u, false)) {
							state.stack.push(state.tokenize);
							state.tokenize = this.eatStartTable.bind(this);
						}
						// Just consume all nested list and indention syntax when there is more
						stream.match(/^[*#;:]*/u);
						return this.makeLocalStyle(modeConfig.tags.list, state);
					case ' ': {
						// Leading spaces is valid syntax for tables, bug T108454
						const mt = stream.match(/^\s*(:+\s*)?(?=\{\||\{{3}\s*!\s*\}\})/u) as RegExpMatchArray | false;
						if (mt) {
							if (mt[1]) { // ::{|
								state.stack.push(state.tokenize);
								state.tokenize = this.eatStartTable.bind(this);
								return this.makeLocalStyle(modeConfig.tags.list, state);
							}
							stream.eat('{');
						} else {
							return modeConfig.tags.skipFormatting;
						}
					}
					// falls through
					case '{':
						if (stream.match(/^(?:\||\{\{\s*!\s*\}\})\s*/u)) {
							state.stack.push(state.tokenize);
							state.tokenize = this.inTableDefinition.bind(this);
							return this.makeLocalStyle(modeConfig.tags.tableBracket, state);
						}
						break;
					default:
						// pass
				}
			} else {
				ch = stream.next();
			}

			switch (ch) {
				case '&':
					return this.makeStyle(this.eatHtmlEntity(stream, style), state);
				case "'":
					// skip the irrelevant apostrophes ( >5 or =4 )
					if (stream.match(/^'*(?='{5})/u) || stream.match(/^'''(?!')/u, false)) {
						break;
					} else if (stream.match("''")) { // bold
						if (!(this.firstSingleLetterWord || stream.match("''", false))) {
							this.prepareItalicForCorrection(stream);
						}
						this.isBold = !this.isBold;
						return this.makeLocalStyle(modeConfig.tags.apostrophesBold, state);
					} else if (stream.eat("'")) { // italic
						this.isItalic = !this.isItalic;
						return this.makeLocalStyle(modeConfig.tags.apostrophesItalic, state);
					}
					break;
				case '[':
					if (stream.eat('[')) { // Link Example: [[ Foo | Bar ]]
						stream.eatSpace();
						if (/[^\]|[]/u.test(stream.peek() || '')) {
							state.nLink++;
							state.stack.push(state.tokenize);
							state.lbrack = false;
							state.tokenize = this.inLink(Boolean(stream.match(this.fileRegex, false)));
							return this.makeLocalStyle(modeConfig.tags.linkBracket, state);
						}
					} else {
						const mt = stream.match(this.urlProtocols, false) as RegExpMatchArray | false;
						if (mt) {
							state.nLink++;
							state.stack.push(state.tokenize);
							state.tokenize = this.eatExternalLinkProtocol(mt[0].length);
							return this.makeLocalStyle(modeConfig.tags.extLinkBracket, state);
						}
					}
					break;
				case '{':
					// Can't be a variable when it starts with more than 3 brackets (T108450) or
					// a single { followed by a template. E.g. {{{!}} starts a table (T292967).
					if (stream.match(/^\{\{(?!\{|[^{}]*\}\}(?!\}))/u)) {
						stream.eatSpace();
						state.stack.push(state.tokenize);
						state.tokenize = this.inVariable.bind(this);
						return this.makeLocalStyle(modeConfig.tags.templateVariableBracket, state);
					} else if (stream.match(/^\{(?!\{(?!\{))\s*/u)) {
						// Parser function
						if (stream.peek() === '#') {
							state.nExt++;
							state.stack.push(state.tokenize);
							state.tokenize = this.inParserFunctionName.bind(this);
							return this.makeLocalStyle(modeConfig.tags.parserFunctionBracket, state);
						}
						// Check for parser function without '#'
						const name = stream
							.match(/^([^\s}[\]<{'|&:]+)(:|\s*)(\}\}?)?(.)?/u, false) as RegExpMatchArray | false;
						if (name && (name[2] === ':' || name[4] === undefined || name[3] === '}}')
							&& (
								name[1]!.toLowerCase() in this.config.functionSynonyms[0]
								|| name[1]! in this.config.functionSynonyms[1]
							)
						) {
							state.nExt++;
							state.stack.push(state.tokenize);
							state.tokenize = this.inParserFunctionName.bind(this);
							return this.makeLocalStyle(modeConfig.tags.parserFunctionBracket, state);
						}
						// Template
						state.nTemplate++;
						state.stack.push(state.tokenize);
						state.tokenize = this.inTemplatePageName(false);
						return this.makeLocalStyle(modeConfig.tags.templateBracket, state);
					}
					break;
				case '<': {
					if (stream.match('!--')) { // comment
						state.stack.push(state.tokenize);
						state.tokenize = this.inBlock(modeConfig.tags.comment, '-->');
						return this.makeLocalStyle(modeConfig.tags.comment, state);
					}
					const isCloseTag = Boolean(stream.eat('/')),
						mt = stream.match(/^[^>/\s.*,[\]{}$^+?|\\'`~<=!@#%&()-]+/u) as RegExpMatchArray | false;
					if (mt) {
						const tagname = mt[0]!.toLowerCase();
						if (tagname in this.config.tags) {
							// Parser function
							if (isCloseTag) {
								state.tokenize = this.inChar('>', modeConfig.tags.error);
								return this.makeLocalStyle(modeConfig.tags.error, state);
							}
							stream.backUp(tagname.length);
							state.stack.push(state.tokenize);
							state.tokenize = this.eatTagName(tagname.length, isCloseTag, false);
							return this.makeLocalStyle(modeConfig.tags.extTagBracket, state);
						} else if (modeConfig.permittedHtmlTags.has(tagname)) {
							// Html tag
							if (isCloseTag && tagname !== state.inHtmlTag.pop()) {
								state.tokenize = this.inChar('>', modeConfig.tags.error);
								return this.makeLocalStyle(modeConfig.tags.error, state);
							} else if (isCloseTag && modeConfig.implicitlyClosedHtmlTags.has(tagname)) {
								return this.makeLocalStyle(modeConfig.tags.error, state);
							}
							stream.backUp(tagname.length);
							state.stack.push(state.tokenize);
							state.tokenize = this.eatTagName(
								tagname.length,
								// Opening void tags should also be treated as the closing tag.
								isCloseTag || modeConfig.implicitlyClosedHtmlTags.has(tagname),
								true,
							);
							return this.makeLocalStyle(modeConfig.tags.htmlTagBracket, state);
						}
						stream.backUp(tagname.length);
					}
					break;
				}
				case '~':
					if (stream.match(/^~{2,4}/u)) {
						return modeConfig.tags.signature;
					}
					break;
				// Maybe double underscored Magic Word such as __TOC__
				case '_': {
					let tmp = 1;
					// Optimize processing of many underscore symbols
					while (stream.eat('_')) {
						tmp++;
					}
					// Many underscore symbols
					if (tmp > 2) {
						if (!stream.eol()) {
							// Leave last two underscore symbols for processing in next iteration
							stream.backUp(2);
						}
						// Optimization: skip regex function for EOL and backup-ed symbols
						return this.makeStyle(style, state);
					// Check on double underscore Magic Word
					} else if (tmp === 2) {
						// The same as the end of function except '_' inside and '__' at the end.
						const name = stream.match(/^\w+?__/u) as RegExpMatchArray | false;
						if (name) {
							if (
								`__${name[0].toLowerCase()}` in this.config.doubleUnderscore[0]
								|| `__${name[0]}` in this.config.doubleUnderscore[1]
							) {
								return modeConfig.tags.doubleUnderscore;
							} else if (!stream.eol()) {
								// Two underscore symbols at the end can be the
								// beginning of another double underscored Magic Word
								stream.backUp(2);
							}
							// Optimization: skip regex for EOL and backup-ed symbols
							return this.makeStyle(style, state);
						}
					}
					break;
				}
				default:
					if (/\s/u.test(ch || '')) {
						stream.eatSpace();
						// highlight free external links, bug T108448
						if (stream.match(this.urlProtocols, false) && !stream.match('//')) {
							state.stack.push(state.tokenize);
							state.tokenize = this.eatFreeExternalLinkProtocol.bind(this);
							return this.makeStyle(style, state);
						}
					}
					break;
			}
			stream.match(/^[^\s_>}[\]<{'|&:~=]+/u);
			return this.makeStyle(style, state);
		};
	}

	/**
	 * Remembers position and status for rollbacking.
	 * It is needed for changing from bold to italic with apostrophes before it, if required.
	 *
	 * @see https://phabricator.wikimedia.org/T108455
	 */
	prepareItalicForCorrection(stream: StringStream): void {
		// See Parser::doQuotes() in MediaWiki Core, it works similarly.
		// this.firstSingleLetterWord has maximum priority
		// this.firstMultiLetterWord has medium priority
		// this.firstSpace has low priority
		const end = stream.pos,
			str = stream.string.slice(0, end - 3),
			x1 = str.slice(-1),
			x2 = str.slice(-2, -1);

		// this.firstSingleLetterWord always is undefined here
		if (x1 === ' ') {
			if (this.firstMultiLetterWord || this.firstSpace) {
				return;
			}
			this.firstSpace = end;
		} else if (x2 === ' ') {
			this.firstSingleLetterWord = end;
		} else if (this.firstMultiLetterWord) {
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
	get mediawiki(): StreamParser<State> {
		return {
			name: 'mediawiki',

			/**
			 * Initial State for the parser.
			 */
			startState: () => ({
				tokenize: this.eatWikiText(''),
				stack: [],
				inHtmlTag: [],
				extName: false,
				extMode: false,
				extState: false,
				nTemplate: 0,
				nLink: 0,
				nExt: 0,
				lpar: false,
				lbrack: false,
			}),

			/**
			 * Copies the given state.
			 */
			copyState: (state): State => {
				const newState = copyState(state);
				if (state.extMode && state.extMode.copyState) {
					newState.extState = state.extMode.copyState(state.extState as State);
				}
				return newState;
			},

			/**
			 * Reads one token, advancing the stream past it,
			 * and returning a string indicating the token's style tag.
			 */
			token: (stream, state): string => {
				let style: string,
					p: number | null = null,
					t: Token,
					f: number | null,
					tmpTokens: Token[] = [];
				const readyTokens: Token[] = [];

				if (this.oldTokens.length > 0) {
					// just send saved tokens till they exists
					t = this.oldTokens.shift()!;
					stream.pos = t.pos;
					return t.style;
				} else if (stream.sol()) {
					// reset bold and italic status in every new line
					this.isBold = false;
					this.isItalic = false;
					this.firstSingleLetterWord = null;
					this.firstMultiLetterWord = null;
					this.firstSpace = null;
				}

				do {
					// get token style
					style = state.tokenize(stream, state);
					f = this.firstSingleLetterWord || this.firstMultiLetterWord || this.firstSpace;
					if (f) {
						// rollback point exists
						if (f !== p) {
							// new rollback point
							p = f;
							// it's not first rollback point
							if (tmpTokens.length > 0) {
								// save tokens
								readyTokens.push(...tmpTokens);
								tmpTokens = [];
							}
						}
						// save token
						tmpTokens.push({
							pos: stream.pos,
							style,
							state: (state.extMode && state.extMode.copyState || copyState)(state),
						});
					} else {
						// rollback point does not exist
						// remember style before possible rollback point
						this.oldStyle = style;
						// just return token style
						return style;
					}
				} while (!stream.eol());

				if (this.isBold && this.isItalic) {
					// needs to rollback
					// restore status
					this.isItalic = this.wasItalic;
					this.isBold = this.wasBold;
					this.firstSingleLetterWord = null;
					this.firstMultiLetterWord = null;
					this.firstSpace = null;
					if (readyTokens.length > 0) {
						// it contains tickets before the point of rollback
						// add one apostrophe, next token will be italic (two apostrophes)
						readyTokens[readyTokens.length - 1]!.pos++;
						// for sending tokens till the point of rollback
						this.oldTokens = readyTokens;
					} else {
						// there are no tickets before the point of rollback
						stream.pos = tmpTokens[0]!.pos - 2; // eat( "'" )
						// send saved Style
						return this.oldStyle || '';
					}
				} else {
					// do not need to rollback
					// send all saved tokens
					this.oldTokens = [
						...readyTokens,
						...tmpTokens,
					];
				}
				// return first saved token
				t = this.oldTokens.shift()!;
				stream.pos = t.pos;
				return t.style;
			},

			blankLine: (state): void => {
				if (state.extMode && state.extMode.blankLine) {
					state.extMode.blankLine(state.extState as State, 0);
				}
			},

			/**
			 * Extra tokens to use in this parser.
			 *
			 * @see modeConfig.tokenTable
			 */
			tokenTable: this.tokenTable,

			languageData: {closeBrackets: {brackets: ['(', '[', '{', '"']}},
		};
	}

	get 'text/mediawiki'(): StreamParser<State> {
		return this.mediawiki;
	}
}

for (const [language, parser] of Object.entries(plugins)) {
	Object.defineProperty(MediaWiki.prototype, language, {
		get() {
			return parser;
		},
	});
}

/**
 * Gets a LanguageSupport instance for the MediaWiki mode.
 */
export const mediawiki = (config: MwConfig): LanguageSupport => {
	const mode = new MediaWiki(config);
	const parser = mode.mediawiki;
	const lang = StreamLanguage.define(parser);
	const highlighter = syntaxHighlighting(HighlightStyle.define(mode.getTagStyles()) as Highlighter);
	return new LanguageSupport(lang, highlighter);
};

export const html = (config: MwConfig): LanguageSupport => mediawiki({
	...config,
	tags: {
		...config.tags,
		script: true,
		style: true,
	},
	tagModes: {
		...config.tagModes,
		script: 'javascript',
		style: 'css',
	},
});
