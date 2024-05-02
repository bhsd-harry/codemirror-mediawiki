/**
 * @author pastakhov, MusikAnimal and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {
	HighlightStyle,
	LanguageSupport,
	StreamLanguage,
	syntaxHighlighting,
	ensureSyntaxTree,
} from '@codemirror/language';
import {Tag} from '@lezer/highlight';
import {modeConfig} from './config';
import * as plugins from './plugins';
import type {StreamParser, StringStream, TagStyle} from '@codemirror/language';
import type {
	CloseBracketConfig,
	CompletionSource,
	Completion,
} from '@codemirror/autocomplete';
import type {CommentTokens} from '@codemirror/commands';
import type {Highlighter} from '@lezer/highlight';

declare type MimeTypes = 'mediawiki' | 'text/mediawiki';
declare type Tokenizer = (stream: StringStream, state: State) => string;
declare type TagName = keyof typeof modeConfig.tags;
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
	nVar: number;
	lpar: boolean;
	lbrack: boolean | undefined;
	dt: {n: number, nTemplate?: number, nLink?: number, nExt?: number, nVar?: number};
}
declare interface Token {
	pos: number;
	readonly style: string;
	readonly state: object;
}

export interface MwConfig {
	readonly tags: Record<string, true>;
	readonly tagModes: Record<string, string>;
	urlProtocols: string;
	functionSynonyms: [Record<string, string>, Record<string, unknown>];
	doubleUnderscore: [Record<string, unknown>, Record<string, unknown>];
	variants?: string[];
	img?: Record<string, string>;
	nsid: Record<string, number>;
	permittedHtmlTags?: string[];
	implicitlyClosedHtmlTags?: string[];
	fromApi?: boolean;
}

const enum TableCell {
	Td,
	Th,
	Caption,
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
	if (str.startsWith('#')) {
		return true;
	}
	span.innerHTML = `&${str}`;
	return [...span.textContent!].length === 1;
};

const chain = (state: State, tokenizer: Tokenizer): void => {
	state.stack.push(state.tokenize);
	state.tokenize = tokenizer;
};

const isSolSyntax = (stream: StringStream): boolean => stream.sol() && /[-=*#;:]/u.test(stream.peek() || '');

/** Adapted from the original CodeMirror 5 stream parser by Pavel Astakhov */
class MediaWiki {
	declare readonly config;
	declare readonly urlProtocols;
	declare isBold;
	declare wasBold;
	declare isItalic;
	declare wasItalic;
	declare firstSingleLetterWord: number | null;
	declare firstMultiLetterWord: number | null;
	declare firstSpace: number | null;
	declare oldStyle: string | null;
	declare oldTokens: Token[];
	declare readonly tokenTable;
	declare readonly permittedHtmlTags;
	declare readonly implicitlyClosedHtmlTags;
	declare readonly fileRegex: RegExp;
	declare readonly functionSynonyms: Completion[];
	declare readonly doubleUnderscore: Completion[];
	declare readonly extTags: Completion[];
	declare readonly htmlTags: Completion[];

	constructor(config: MwConfig) {
		this.config = config;
		this.urlProtocols = new RegExp(`^(?:${config.urlProtocols})(?=[^\\s[\\]<>])`, 'iu');
		this.isBold = false;
		this.wasBold = false;
		this.isItalic = false;
		this.wasItalic = false;
		this.firstSingleLetterWord = null;
		this.firstMultiLetterWord = null;
		this.firstSpace = null;
		this.oldStyle = null;
		this.oldTokens = [];
		this.tokenTable = {...modeConfig.tokenTable};
		this.registerGroundTokens();
		this.permittedHtmlTags = new Set([
			...modeConfig.permittedHtmlTags,
			...config.permittedHtmlTags || [],
		]);
		this.implicitlyClosedHtmlTags = new Set([
			...modeConfig.implicitlyClosedHtmlTags,
			...config.implicitlyClosedHtmlTags || [],
		]);
		for (const tag of Object.keys(config.tags)) {
			this.addTag(tag);
		}
		const nsFile = Object.entries(this.config.nsid).filter(([, id]) => id === 6).map(([ns]) => ns).join('|');
		this.fileRegex = new RegExp(`^(?:${nsFile})\\s*:`, 'iu');
		this.functionSynonyms = this.config.functionSynonyms.flatMap((obj, i) => Object.keys(obj).map(label => ({
			type: i ? 'constant' : 'function',
			label,
		})));
		this.doubleUnderscore = this.config.doubleUnderscore.flatMap(Object.keys).map(label => ({
			type: 'constant',
			label,
		}));
		const extTags = Object.keys(config.tags);
		this.extTags = extTags.map(label => ({type: 'type', label}));
		this.htmlTags = modeConfig.permittedHtmlTags.filter(tag => !extTags.includes(tag)).map(label => ({
			type: 'type',
			label,
		}));
	}

	/**
	 * Register a token for the given tag in CodeMirror. The generated CSS class will be of
	 * the form 'cm-mw-tag-tagname'. This is for internal use to dynamically register tags
	 * from other MediaWiki extensions.
	 *
	 * @see https://www.mediawiki.org/wiki/Extension:CodeMirror#Extension_integration
	 * @param tag
	 * @param parent
	 * @internal
	 */
	addTag(tag: string, parent?: Tag): void {
		this.addToken(`mw-tag-${tag}`, parent);
	}

	/**
	 * Dynamically register a token in CodeMirror.
	 * This is solely for use by this.addTag() and CodeMirrorModeMediaWiki.makeLocalStyle().
	 *
	 * @param token
	 * @param parent
	 * @internal
	 */
	addToken(token: string, parent?: Tag): void {
		(this.tokenTable[token] as Tag | undefined) ||= Tag.define(parent);
	}

	/**
	 * Register the ground tokens. These aren't referenced directly in the StreamParser, nor do
	 * they have a parent Tag, so we don't need them as constants like we do for other tokens.
	 * See this.makeLocalStyle() for how these tokens are used.
	 */
	registerGroundTokens(): void {
		const grounds = [
			'mw-ext-ground',
			'mw-ext-link-ground',
			'mw-ext2-ground',
			'mw-ext2-link-ground',
			'mw-ext3-ground',
			'mw-ext3-link-ground',
			'mw-link-ground',
			'mw-template-ext-ground',
			'mw-template-ext-link-ground',
			'mw-template-ext2-ground',
			'mw-template-ext2-link-ground',
			'mw-template-ext3-ground',
			'mw-template-ext3-link-ground',
			'mw-template-ground',
			'mw-template-link-ground',
			'mw-template2-ext-ground',
			'mw-template2-ext-link-ground',
			'mw-template2-ext2-ground',
			'mw-template2-ext2-link-ground',
			'mw-template2-ext3-ground',
			'mw-template2-ext3-link-ground',
			'mw-template2-ground',
			'mw-template2-link-ground',
			'mw-template3-ext-ground',
			'mw-template3-ext-link-ground',
			'mw-template3-ext2-ground',
			'mw-template3-ext2-link-ground',
			'mw-template3-ext3-ground',
			'mw-template3-ext3-link-ground',
			'mw-template3-ground',
			'mw-template3-link-ground',
			'mw-section--1',
			'mw-section--2',
			'mw-section--3',
			'mw-section--4',
			'mw-section--5',
			'mw-section--6',
		];
		for (const ground of grounds) {
			this.addToken(ground);
		}
	}

	/**
	 * This defines the actual CSS class assigned to each tag/token.
	 *
	 * @see https://codemirror.net/docs/ref/#language.TagStyle
	 */
	getTagStyles(): TagStyle[] {
		return Object.keys(this.tokenTable).map(className => ({
			tag: this.tokenTable[className]!,
			class: `cm-${className}`,
		}));
	}

	makeTagStyle(tag: TagName, state: State, endGround?: 'nTemplate' | 'nLink' | 'nExt' | 'nVar'): string {
		return this.makeStyle(modeConfig.tags[tag], state, endGround);
	}

	makeStyle(style: string, state: State, endGround?: 'nTemplate' | 'nLink' | 'nExt' | 'nVar'): string {
		return this.makeLocalStyle(
			`${style} ${
				this.isBold || state.dt.n ? modeConfig.tags.strong : ''
			} ${this.isItalic ? modeConfig.tags.em : ''}`,
			state,
			endGround,
		);
	}

	makeLocalTagStyle(tag: TagName, state: State, endGround?: 'nTemplate' | 'nLink' | 'nExt' | 'nVar'): string {
		return this.makeLocalStyle(modeConfig.tags[tag], state, endGround);
	}

	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	makeLocalStyle(style: string, state: State, endGround?: 'nTemplate' | 'nLink' | 'nExt' | 'nVar'): string {
		let ground = '';
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
		if (state.nLink) {
			ground += '-link';
		}
		if (endGround) {
			state[endGround]--;
			const {dt} = state;
			if (dt.n && state[endGround] < dt[endGround]!) {
				dt.n = 0;
			}
		}
		return (ground && `mw${ground}-ground `) + style;
	}

	inBlock(tag: TagName, terminator: string, consumeLast?: boolean): Tokenizer {
		return (stream, state) => {
			if (stream.skipTo(terminator)) {
				if (consumeLast) {
					stream.match(terminator);
				}
				state.tokenize = state.stack.pop()!;
			} else {
				stream.skipToEnd();
			}
			return this.makeLocalTagStyle(tag, state);
		};
	}

	inChar(char: string, tag: TagName): Tokenizer {
		return (stream, state) => {
			if (stream.eat(char)) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalTagStyle(tag, state);
			} else if (!stream.skipTo(char)) {
				stream.skipToEnd();
			}
			return this.makeLocalTagStyle('error', state);
		};
	}

	eatFreeExternalLinkProtocol(stream: StringStream, state: State): string {
		stream.match(this.urlProtocols);
		state.tokenize = this.inFreeExternalLink.bind(this);
		return this.makeTagStyle('freeExtLinkProtocol', state);
	}

	inFreeExternalLink(stream: StringStream, state: State): string {
		if (!stream.sol()) {
			const mt = stream.match(/^[^\s{[\]<>~).,;:!?'"]*/u) as RegExpMatchArray,
				ch = stream.peek();
			state.lpar ||= mt[0].includes('(');
			switch (ch!) {
				case '~':
					if (stream.match(/^~~?(?!~)/u)) {
						return this.makeTagStyle('freeExtLink', state);
					}
					break;
				case '{':
					if (stream.match(/^\{(?!\{)/u)) {
						return this.makeTagStyle('freeExtLink', state);
					}
					break;
				case "'":
					if (stream.match(/^'(?!')/u)) {
						return this.makeTagStyle('freeExtLink', state);
					}
					break;
				case ')':
					if (state.lpar) {
						stream.eatWhile(')');
						return this.makeTagStyle('freeExtLink', state);
					}
					// fall through
				case '.':
				case ',':
				case ';':
				case ':':
				case '!':
				case '?':
					if (stream.match(/^[).,;:!?]+(?=[^\s{[\]<>~).,;:!?'"]|~~?(?!~)|\{(?!\{)|'(?!'))/u)) {
						return this.makeTagStyle('freeExtLink', state);
					}
				// no default
			}
		}
		state.lpar = false;
		state.tokenize = state.stack.pop()!;
		return this.makeTagStyle('freeExtLink', state);
	}

	inSectionHeader(count: number): Tokenizer {
		return (stream, state) => {
			if (stream.eatWhile(/[^&<[{~'_]/u)) {
				if (stream.eol()) {
					stream.backUp(count);
					state.tokenize = this.eatSectionHeader.bind(this);
				} else if (stream.match(/^<!--(?!.*?-->.*?=)/u, false)) {
					// T171074: handle trailing comments
					stream.backUp(count);
					state.tokenize = this.inBlock('sectionHeader', '<!--');
				}
				return this.makeLocalTagStyle('section', state);
			}
			return this.eatWikiText(modeConfig.tags.section)(stream, state);
		};
	}

	eatSectionHeader(stream: StringStream, state: State): string {
		stream.skipToEnd();
		state.tokenize = state.stack.pop()!;
		return this.makeLocalTagStyle('sectionHeader', state);
	}

	eatList(stream: StringStream, state: State): string {
		const mt = stream.match(/^[*#;:]*/u) as RegExpMatchArray | false,
			{dt} = state;
		if (mt && mt[0].includes(';')) {
			dt.n += mt[0].split(';').length - 1;
		}
		if (dt.n) {
			dt.nTemplate = state.nTemplate;
			dt.nLink = state.nLink;
			dt.nExt = state.nExt;
			dt.nVar = state.nVar;
		}
		return this.makeLocalTagStyle('list', state);
	}

	eatStartTable(stream: StringStream, state: State): string {
		stream.match(/^(?:\{\||\{{3}\s*!\s*\}\})\s*/u);
		state.tokenize = this.inTableDefinition.bind(this);
		return this.makeLocalTagStyle('tableBracket', state);
	}

	inTableDefinition(stream: StringStream, state: State): string {
		if (stream.sol()) {
			state.tokenize = this.inTable.bind(this);
			return '';
		}
		return stream.eatWhile(/[^&{<]/u)
			? this.makeLocalTagStyle('tableDefinition', state)
			: this.eatWikiText(modeConfig.tags.tableDefinition)(stream, state);
	}

	inTable(stream: StringStream, state: State): string {
		if (stream.sol()) {
			stream.eatSpace();
			if (stream.match(/^(?:\||\{\{\s*!\s*\}\})/u)) {
				if (stream.match(/^-+\s*/u)) {
					state.tokenize = this.inTableDefinition.bind(this);
					return this.makeLocalTagStyle('tableDelimiter', state);
				} else if (stream.match(/^\+\s*/u)) {
					state.tokenize = this.inTableCell(true, TableCell.Caption);
					return this.makeLocalTagStyle('tableDelimiter', state);
				} else if (stream.eat('}')) {
					state.tokenize = state.stack.pop()!;
					return this.makeLocalTagStyle('tableBracket', state);
				}
				stream.eatSpace();
				state.tokenize = this.inTableCell(true, TableCell.Td);
				return this.makeLocalTagStyle('tableDelimiter', state);
			} else if (stream.match(/^!\s*/u)) {
				state.tokenize = this.inTableCell(true, TableCell.Th);
				return this.makeLocalTagStyle('tableDelimiter', state);
			}
		}
		return this.eatWikiText(modeConfig.tags.error)(stream, state);
	}

	inTableCell(needAttr: boolean, type: TableCell, firstLine = true): Tokenizer {
		let style = '';
		if (type === TableCell.Caption) {
			style = modeConfig.tags.tableCaption;
		} else if (type === TableCell.Th) {
			style = modeConfig.tags.strong;
		}
		return (stream, state) => {
			if (stream.sol()) {
				if (stream.match(/^\s*(?:[|!]|\{\{\s*!\s*\}\})/u, false)) {
					state.tokenize = this.inTable.bind(this);
					return '';
				} else if (firstLine) {
					state.tokenize = this.inTableCell(false, type, false);
					return '';
				}
			}
			if (isSolSyntax(stream)) {
				return this.eatWikiText(style)(stream, state);
			} else if (stream.eatWhile(firstLine ? /[^'{[<&~_|!]/u : /[^'{[<&~_:]/u)) {
				return this.makeStyle(style, state);
			} else if (firstLine) {
				if (
					stream.match(/^(?:\||\{\{\s*!\s*\}\}){2}\s*/u)
					|| type === TableCell.Th && stream.match(/^!!\s*/u)
				) {
					this.isBold = false;
					this.isItalic = false;
					state.tokenize = this.inTableCell(true, type);
					return this.makeLocalTagStyle('tableDelimiter', state);
				} else if (needAttr && stream.match(/^(?:\||\{\{\s*!\s*\}\})\s*/u)) {
					state.tokenize = this.inTableCell(false, type);
					return this.makeLocalTagStyle('tableDelimiter', state);
				}
			}
			return this.eatWikiText(style)(stream, state);
		};
	}

	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	eatHtmlEntity(stream: StringStream, style: string): string {
		const entity = stream.match(/^(?:#x[a-f\d]+|#\d+|[a-z\d]+);/iu) as RegExpMatchArray | false;
		return entity && isHtmlEntity(entity[0]) ? modeConfig.tags.htmlEntity : style;
	}

	eatExternalLinkProtocol(chars: number): Tokenizer {
		return (stream, state) => {
			for (let i = 0; i < chars; i++) {
				stream.next();
			}
			if (stream.eol()) {
				state.nLink--;
				state.tokenize = state.stack.pop()!;
			} else {
				state.tokenize = this.inExternalLink.bind(this);
			}
			return this.makeLocalTagStyle('extLinkProtocol', state);
		};
	}

	inExternalLink(stream: StringStream, state: State): string {
		if (stream.sol()) {
			state.nLink--;
			state.tokenize = state.stack.pop()!;
			return '';
		} else if (stream.match(/^\s*\]/u)) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalTagStyle('extLinkBracket', state, 'nLink');
		} else if (stream.eatSpace() || stream.match(/^(?:[[<>"]|&[lg]t;|'{2,3}(?!')|'{5}(?!')|\{\{|~{3})/u, false)) {
			state.tokenize = this.inExternalLinkText.bind(this);
			return this.makeLocalStyle('', state);
		}
		stream.next();
		stream.eatWhile(/[^\s[\]<>"&~'{]/u);
		return this.makeLocalTagStyle('extLink', state);
	}

	inExternalLinkText(stream: StringStream, state: State): string {
		if (stream.sol()) {
			state.nLink--;
			state.tokenize = state.stack.pop()!;
			return '';
		} else if (stream.eat(']')) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalTagStyle('extLinkBracket', state, 'nLink');
		}
		return stream.match(/^(?:[^'[\]{&~<]|\[(?!\[))+/u)
			? this.makeTagStyle('extLinkText', state)
			: this.eatWikiText(modeConfig.tags.extLinkText)(stream, state);
	}

	inLink(file: boolean): Tokenizer {
		const style = `${modeConfig.tags.linkPageName} ${modeConfig.tags.pageName}`;
		return (stream, state) => {
			if (stream.sol()) {
				state.nLink--;
				state.lbrack = false;
				state.tokenize = state.stack.pop()!;
				return '';
			}
			const space = stream.eatSpace();
			if (stream.match(/^#\s*/u)) {
				state.tokenize = this.inLinkToSection(file);
				return this.makeTagStyle(file ? 'error' : 'linkToSection', state);
			} else if (stream.match(/^\|\s*/u)) {
				state.tokenize = this.inLinkText(file);
				return this.makeLocalTagStyle('linkDelimiter', state);
			} else if (stream.match(']]')) {
				state.lbrack = false;
				state.tokenize = state.stack.pop()!;
				return this.makeLocalTagStyle('linkBracket', state, 'nLink');
			} else if (stream.match(/^(?:[>[}]+|\]|\{(?!\{))/u)) {
				return this.makeTagStyle('error', state);
			}
			return stream.eatWhile(/[^#|[\]&{}<>]/u) || space
				? this.makeStyle(style, state)
				: this.eatWikiText(style)(stream, state);
		};
	}

	inLinkToSection(file: boolean): Tokenizer {
		const tag = file ? 'error' : 'linkToSection';
		return (stream, state) => {
			if (stream.sol()) {
				state.nLink--;
				state.lbrack = false;
				state.tokenize = state.stack.pop()!;
				return '';
			} else if (stream.eat('|')) {
				state.tokenize = this.inLinkText(file);
				return this.makeLocalTagStyle('linkDelimiter', state);
			} else if (stream.match(']]')) {
				state.lbrack = false;
				state.tokenize = state.stack.pop()!;
				return this.makeLocalTagStyle('linkBracket', state, 'nLink');
			}
			return stream.eatWhile(/[^|\]&{}<]/u)
				? this.makeTagStyle(tag, state)
				: this.eatWikiText(modeConfig.tags[tag])(stream, state);
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
				state.lbrack = false;
				state.tokenize = state.stack.pop()!;
				return this.makeLocalTagStyle('linkBracket', state, 'nLink');
			} else if (file && stream.eat('|')) {
				return this.makeLocalTagStyle('linkDelimiter', state);
			} else if (stream.peek() === "'") {
				const mt = stream.match(/^'+/u) as RegExpMatchArray;
				switch (mt[0].length) {
					case 3:
						linkIsBold = !linkIsBold;
						return this.makeLocalTagStyle('apostrophes', state);
					case 5:
						linkIsBold = !linkIsBold;
						// fall through
					case 2:
						linkIsItalic = !linkIsItalic;
						return this.makeLocalTagStyle('apostrophes', state);
					case 4:
						stream.backUp(3);
						// fall through
					case 1:
						break;
					default:
						stream.backUp(5);
				}
				return this.makeStyle(tmpstyle, state);
			}
			/** @todo image parameters */
			const regex = file
					? new RegExp(`^(?:[^'\\]{&~<|[]|\\[(?!\\[|${this.config.urlProtocols}))+`, 'iu')
					: /^[^'\]{&~<]+/u,
				mt = stream.match(regex) as RegExpMatchArray | false;
			if (state.lbrack === undefined && mt && mt[0].includes('[')) {
				state.lbrack = true;
			}
			return mt ? this.makeStyle(tmpstyle, state) : this.eatWikiText(tmpstyle)(stream, state);
		};
	}

	inVariable(stream: StringStream, state: State): string {
		if (stream.eat('|')) {
			state.tokenize = this.inVariableDefault(true);
			return this.makeLocalTagStyle('templateVariableDelimiter', state);
		} else if (stream.match('}}}')) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalTagStyle('templateVariableBracket', state, 'nVar');
		} else if (stream.match('{{{')) {
			state.stack.push(state.tokenize);
			return this.makeLocalTagStyle('templateVariableBracket', state);
		} else if (stream.match('<!--', false)) {
			chain(state, this.inComment);
			return '';
		} else if (!stream.eatWhile(/[^{}|<]/u)) {
			stream.next();
		}
		return this.makeLocalTagStyle('templateVariableName', state);
	}

	inVariableDefault(isFirst?: boolean): Tokenizer {
		const style = modeConfig.tags[isFirst ? 'templateVariable' : 'comment'];
		return (stream, state) => {
			if (stream.match('}}}')) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalTagStyle('templateVariableBracket', state, 'nVar');
			} else if (stream.eat('|')) {
				if (isFirst) {
					state.tokenize = this.inVariableDefault();
				}
				return this.makeLocalTagStyle('templateVariableDelimiter', state);
			}
			return isFirst && isSolSyntax(stream) || !stream.eatWhile(isFirst ? /[^|{}[<&~'_:]/u : /[^|{}[<]/u)
				? this.eatWikiText(style)(stream, state)
				: this.makeStyle(style, state);
		};
	}

	get inComment(): Tokenizer {
		return this.inBlock('comment', '-->', true);
	}

	inParserFunctionName(stream: StringStream, state: State): string {
		// FIXME: {{#name}} and {{uc}} are wrong, must have ':'
		if (stream.eatWhile(/[^:}{~|<>[\]]/u)) {
			return this.makeLocalTagStyle('parserFunctionName', state);
		} else if (stream.eat(':')) {
			state.tokenize = this.inParserFunctionArguments.bind(this);
			return this.makeLocalTagStyle('parserFunctionDelimiter', state);
		} else if (stream.match('}}')) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalTagStyle('parserFunctionBracket', state, 'nExt');
		}
		return this.eatWikiText(modeConfig.tags.error)(stream, state);
	}

	inParserFunctionArguments(stream: StringStream, state: State): string {
		if (stream.eat('|')) {
			return this.makeLocalTagStyle('parserFunctionDelimiter', state);
		} else if (stream.match('}}')) {
			state.tokenize = state.stack.pop()!;
			return this.makeLocalTagStyle('parserFunctionBracket', state, 'nExt');
		}
		return isSolSyntax(stream) || !stream.eatWhile(/[^|}{[<&~'_:]/u)
			? this.eatWikiText(modeConfig.tags.parserFunction)(stream, state)
			: this.makeLocalTagStyle('parserFunction', state);
	}

	inTemplatePageName(haveEaten?: boolean, anchor?: boolean): Tokenizer {
		const style = anchor ? modeConfig.tags.error : `${modeConfig.tags.templateName} ${modeConfig.tags.pageName}`;
		return (stream, state) => {
			const sol = stream.sol(),
				space = stream.eatSpace();
			if (stream.eol()) {
				return this.makeLocalStyle(style, state);
			} else if (stream.eat('|')) {
				state.tokenize = this.inTemplateArgument(true);
				return this.makeLocalTagStyle('templateDelimiter', state);
			} else if (stream.match('}}')) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalTagStyle('templateBracket', state, 'nTemplate');
			} else if (stream.match('<!--', false)) {
				chain(state, this.inComment);
				return this.makeLocalStyle('', state);
			} else if (haveEaten && !anchor && sol) {
				state.nTemplate--;
				state.tokenize = state.stack.pop()!;
				stream.pos = 0;
				return '';
			} else if (!anchor && stream.eat('#')) {
				state.tokenize = this.inTemplatePageName(true, true);
				return this.makeLocalTagStyle('error', state);
			} else if (stream.match(anchor ? /^(?:[^|{}<]|([{}])(?!\1)|<(?!!--))+/u : /^[^|{}<>[\]#]+/u)) {
				state.tokenize = this.inTemplatePageName(true, anchor);
				return this.makeLocalStyle(style, state);
			} else if (stream.match(/^(?:[<>[\]}]|\{(?!\{))/u)) {
				return this.makeLocalTagStyle('error', state);
			}
			return space
				? this.makeLocalStyle(style, state)
				: this.eatWikiText(style)(stream, state);
		};
	}

	inTemplateArgument(expectName?: boolean): Tokenizer {
		const regex = new RegExp(
			`^(?:[^=|}{[<]|\\[(?!\\[)|<(?!!--|(?:${Object.keys(this.config.tags).join('|')})[\\s/>]))*=`,
			'iu',
		);
		return (stream, state) => {
			const space = stream.eatSpace();
			if (stream.eol()) {
				return this.makeLocalTagStyle('template', state);
			} else if (stream.match(/^\|\s*/u)) {
				state.tokenize = this.inTemplateArgument(true);
				return this.makeLocalTagStyle('templateDelimiter', state);
			} else if (stream.match('}}')) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalTagStyle('templateBracket', state, 'nTemplate');
			} else if (expectName && stream.match(regex)) {
				state.tokenize = this.inTemplateArgument();
				return this.makeLocalTagStyle('templateArgumentName', state);
			}
			return !isSolSyntax(stream) && stream.eatWhile(/[^|}{[<&~'_:]/u) || space
				? this.makeLocalTagStyle('template', state)
				: this.eatWikiText(modeConfig.tags.template)(stream, state);
		};
	}

	eatTagName(chars: number, isCloseTag?: boolean, isHtmlTag?: boolean): Tokenizer {
		return (stream, state) => {
			let name = '';
			for (let i = 0; i < chars; i++) {
				name += stream.next();
			}
			stream.eatSpace();
			name = name.toLowerCase();
			if (isHtmlTag) {
				state.tokenize = isCloseTag ? this.inChar('>', 'htmlTagBracket') : this.inHtmlTagAttribute(name);
				return this.makeLocalTagStyle('htmlTagName', state);
			}
			// it is the extension tag
			state.tokenize = isCloseTag ? this.inChar('>', 'extTagBracket') : this.inExtTagAttribute(name);
			return this.makeLocalTagStyle('extTagName', state);
		};
	}

	inHtmlTagAttribute(name: string): Tokenizer {
		return (stream, state) => {
			if (stream.match(/^(?:"[^<">]*"|'[^<'>]*'[^>/<{])+/u)) {
				return this.makeLocalTagStyle('htmlTagAttribute', state);
			} else if (stream.peek() === '<') {
				state.tokenize = state.stack.pop()!;
				return '';
			} else if (stream.match(/^\/?>/u)) {
				if (!this.implicitlyClosedHtmlTags.has(name)) {
					state.inHtmlTag.unshift(name);
				}
				state.tokenize = state.stack.pop()!;
				return this.makeLocalTagStyle('htmlTagBracket', state);
			}
			return this.eatWikiText(modeConfig.tags.htmlTagAttribute)(stream, state);
		};
	}

	get eatNowiki(): Tokenizer {
		return stream => {
			if (stream.eatWhile(/[^&]/u)) {
				return '';
			}
			// eat &
			stream.next();
			return this.eatHtmlEntity(stream, '');
		};
	}

	inExtTagAttribute(name: string): Tokenizer {
		return (stream, state) => {
			if (stream.match(/^(?:"[^">]*"|'[^'>]*'|[^>/])+/u)) {
				return this.makeLocalTagStyle('extTagAttribute', state);
			} else if (stream.eat('>')) {
				state.extName = name;
				if (name === 'nowiki' || name === 'pre') {
					// There's no actual processing within these tags (apart from HTML entities),
					// so startState and copyState can be no-ops.
					state.extMode = {
						startState: () => ({}),
						token: this.eatNowiki,
					};
					state.extState = {};
				} else if (name in this.config.tagModes) {
					state.extMode = this[this.config.tagModes[name] as MimeTypes];
					state.extState = state.extMode.startState!(0);
				}
				state.tokenize = this.eatExtTagArea(name);
				return this.makeLocalTagStyle('extTagBracket', state);
			} else if (stream.match('/>')) {
				state.tokenize = state.stack.pop()!;
				return this.makeLocalTagStyle('extTagBracket', state);
			}
			return this.eatWikiText(modeConfig.tags.extTagAttribute)(stream, state);
		};
	}

	eatExtTagArea(name: string): Tokenizer {
		return (stream, state) => {
			const from = stream.pos,
				m = new RegExp(`</${name}\\s*(?:>|$)`, 'iu').exec(from ? stream.string.slice(from) : stream.string);
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
				origString = stream.string;
				stream.string = origString.slice(0, m.index + from);
			}
			chain(state, this.inExtTokens(origString));
			return state.tokenize(stream, state);
		};
	}

	eatExtCloseTag(name: string): Tokenizer {
		return (stream, state) => {
			stream.next(); // eat <
			stream.next(); // eat /
			state.tokenize = this.eatTagName(name.length, true);
			return this.makeLocalTagStyle('extTagBracket', state);
		};
	}

	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	inExtTokens(origString: string | false): Tokenizer {
		return (stream, state) => {
			let ret: string;
			if (state.extMode === false) {
				ret = `mw-tag-${state.extName} ${modeConfig.tags.extTag}`;
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

	/**
	 * @todo 添加stage参数
	 * @ignore
	 */
	eatWikiText(style: string): Tokenizer {
		return (stream, state) => {
			let ch: string;
			if (stream.eol()) {
				return '';
			} else if (stream.sol()) {
				/** @todo free external links anywhere */
				if (stream.match('//')) {
					return this.makeStyle(style, state);
				// highlight free external links, see T108448
				} else if (stream.match(this.urlProtocols)) {
					chain(state, this.inFreeExternalLink.bind(this));
					return this.makeTagStyle('freeExtLinkProtocol', state);
				}
				ch = stream.next()!;
				switch (ch) {
					case '-':
						if (stream.match(/^-{3,}/u)) {
							return modeConfig.tags.hr;
						}
						break;
					case '=': {
						const tmp = stream
							.match(/^(={0,5})(.+?(=\1\s*)(?:<!--(?!.*-->\s*\S).*)?)$/u) as RegExpMatchArray | false;
						// Title
						if (tmp) {
							stream.backUp(tmp[2]!.length);
							chain(state, this.inSectionHeader(tmp[3]!.length));
							return this.makeLocalStyle(
								`${modeConfig.tags.sectionHeader} mw-section--${tmp[1]!.length + 1}`,
								state,
							);
						}
						break;
					}
					case ';':
						state.dt.n++;
						// fall through
					case '*':
					case '#':
						return this.eatList(stream, state);
					case ':':
						// Highlight indented tables :{|, bug T108454
						if (stream.match(/^:*\s*(?=\{\||\{{3}\s*!\s*\}\})/u)) {
							chain(state, this.eatStartTable.bind(this));
							return this.makeLocalTagStyle('list', state);
						}
						return this.eatList(stream, state);
					case ' ': {
						// Leading spaces is valid syntax for tables, bug T108454
						const mt = stream.match(/^\s*(:+\s*)?(?=\{\||\{{3}\s*!\s*\}\})/u) as RegExpMatchArray | false;
						if (mt) {
							if (mt[1]) { // ::{|
								chain(state, this.eatStartTable.bind(this));
								return this.makeLocalTagStyle('list', state);
							}
							stream.eat('{');
						} else {
							/** @todo indent-pre is sometimes suppressed */
							return modeConfig.tags.skipFormatting;
						}
					}
					// fall through
					case '{':
						if (stream.match(/^(?:\||\{\{\s*!\s*\}\})\s*/u)) {
							chain(state, this.inTableDefinition.bind(this));
							return this.makeLocalTagStyle('tableBracket', state);
						}
					// no default
				}
			} else {
				ch = stream.next()!;
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
						return this.makeLocalTagStyle('apostrophes', state);
					} else if (stream.eat("'")) { // italic
						this.isItalic = !this.isItalic;
						return this.makeLocalTagStyle('apostrophes', state);
					}
					break;
				case '[':
					if (stream.match(/^\[\s*/u)) { // Link Example: [[ Foo | Bar ]]
						if (/[^[\]|]/u.test(stream.peek() || '')) {
							state.nLink++;
							state.lbrack = undefined;
							chain(state, this.inLink(Boolean(stream.match(this.fileRegex, false))));
							return this.makeLocalTagStyle('linkBracket', state);
						}
					} else {
						const mt = stream.match(this.urlProtocols, false) as RegExpMatchArray | false;
						if (mt) {
							state.nLink++;
							chain(state, this.eatExternalLinkProtocol(mt[0].length));
							return this.makeLocalTagStyle('extLinkBracket', state);
						}
					}
					break;
				case '{':
					// Can't be a variable when it starts with more than 3 brackets (T108450) or
					// a single { followed by a template. E.g. {{{!}} starts a table (T292967).
					if (stream.match(/^\{\{(?!\{|[^{}]*\}\}(?!\}))\s*/u)) {
						state.nVar++;
						chain(state, this.inVariable.bind(this));
						return this.makeLocalTagStyle('templateVariableBracket', state);
					} else if (stream.match(/^\{(?!\{(?!\{))\s*/u)) {
						// Parser function
						if (stream.peek() === '#') {
							state.nExt++;
							chain(state, this.inParserFunctionName.bind(this));
							return this.makeLocalTagStyle('parserFunctionBracket', state);
						}
						// Check for parser function without '#'
						const name = stream
							.match(/^([^\s}[\]<{'|&:]+)(:|\s*)(\}\}?)?(.)?/u, false) as RegExpMatchArray | false;
						if (
							name && (name[2] === ':' || name[4] === undefined || name[3] === '}}')
							&& (
								name[1]!.toLowerCase() in this.config.functionSynonyms[0]
								|| name[1]! in this.config.functionSynonyms[1]
							)
						) {
							state.nExt++;
							chain(state, this.inParserFunctionName.bind(this));
							return this.makeLocalTagStyle('parserFunctionBracket', state);
						}
						// Template
						state.nTemplate++;
						chain(state, this.inTemplatePageName());
						return this.makeLocalTagStyle('templateBracket', state);
					}
					break;
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
						const name = stream.match(/^[\p{L}\d_]+?__/u) as RegExpMatchArray | false;
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
				/** @todo consider the balance of HTML tags, including apostrophes */
				case ':': {
					const {dt} = state;
					if (
						dt.n
						&& dt.nTemplate === state.nTemplate
						&& dt.nLink === state.nLink
						&& dt.nExt === state.nExt
						&& dt.nVar === state.nVar
					) {
						dt.n--;
						return this.makeLocalTagStyle('list', state);
					}
					break;
				}
				case '<': {
					if (stream.match('!--', false)) { // comment
						stream.backUp(1);
						chain(state, this.inComment);
						return '';
					}
					const isCloseTag = Boolean(stream.eat('/')),
						mt = stream.match(
							/^[^>/\s.*,[\]{}$^+?|\\'`~<=!@#%&()-]+(?=[>/\s]|$)/u,
						) as RegExpMatchArray | false;
					if (mt) {
						const tagname = mt[0].toLowerCase();
						if (tagname in this.config.tags) {
							// Extension tag
							if (isCloseTag) {
								chain(state, this.inChar('>', 'error'));
								return this.makeLocalTagStyle('error', state);
							}
							stream.backUp(tagname.length);
							chain(state, this.eatTagName(tagname.length, isCloseTag));
							return this.makeLocalTagStyle('extTagBracket', state);
						} else if (this.permittedHtmlTags.has(tagname)) {
							// Html tag
							if (isCloseTag) {
								if (tagname === state.inHtmlTag[0]) {
									state.inHtmlTag.shift();
								} else {
									chain(state, this.inChar('>', 'error'));
									return this.makeLocalTagStyle('error', state);
								}
							}
							stream.backUp(tagname.length);
							chain(state, this.eatTagName(tagname.length, isCloseTag, true));
							return this.makeLocalTagStyle('htmlTagBracket', state);
						}
						stream.backUp(tagname.length);
					}
					break;
				}
				default:
					if (/\s/u.test(ch || '')) {
						stream.eatSpace();
						// highlight free external links, bug T108448
						if (stream.match(this.urlProtocols, false) && !stream.match('//')) {
							chain(state, this.eatFreeExternalLinkProtocol.bind(this));
							return this.makeStyle(style, state);
						}
					}
			}
			stream.eatWhile(/[^\s_[<{'&~:|=>}\]]/u);
			return this.makeStyle(style, state);
		};
	}

	/**
	 * Remembers position and status for rollbacking.
	 * It is needed for changing from bold to italic with apostrophes before it, if required.
	 *
	 * @see https://phabricator.wikimedia.org/T108455
	 * @param stream
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

	/** 自动补全魔术字和标签名 */
	get completionSource(): CompletionSource {
		return context => {
			const {state, pos} = context,
				node = ensureSyntaxTree(state, pos)?.resolve(pos, -1);
			if (!node) {
				return null;
			}
			const types = new Set(node.name.split('_'));
			if (types.has(modeConfig.tags.templateName) || types.has(modeConfig.tags.parserFunctionName)) {
				return {
					from: node.from,
					options: this.functionSynonyms,
					validFor: /^[^|{}<]*$/u,
				};
			} else if (!types.has(modeConfig.tags.comment) && !types.has(modeConfig.tags.templateVariableName)) {
				let mt = context.matchBefore(/__(?:(?!__)[\p{L}\d_])*$/u);
				if (mt) {
					return {
						from: mt.from,
						options: this.doubleUnderscore,
						validFor: /^[\p{L}\d]*$/u,
					};
				}
				mt = context.matchBefore(/<\/?[a-z\d]*$/iu);
				if (!mt || mt.to - mt.from < 2) {
					return null;
				}
				const validFor = /^[a-z\d]*$/iu;
				if (mt.text[1] === '/') {
					const mt2 = context.matchBefore(/<[a-z\d]+(?:\s[^<>]*)?>(?:(?!<\/?[a-z]).)*<\/[a-z\d]*$/iu),
						target = /^<([a-z\d]+)/iu.exec(mt2?.text || '')?.[1]!.toLowerCase(),
						extTag = [...types].reverse().find(t => t.startsWith('mw-tag-'))?.slice(7),
						options = [
							...this.htmlTags.filter(({label}) => !this.implicitlyClosedHtmlTags.has(label)),
							...extTag ? [{type: 'type', label: extTag, boost: 50}] : [],
						],
						i = this.permittedHtmlTags.has(target!) && options.findIndex(({label}) => label === target);
					if (i !== false && i !== -1) {
						options.splice(i, 1, {type: 'type', label: target!, boost: 99});
					}
					return {from: mt.from + 2, options, validFor};
				}
				return {
					from: mt.from + 1,
					options: [...this.htmlTags, ...this.extTags],
					validFor,
				};
			}
			return null;
		};
	}

	/**
	 * main entry
	 *
	 * @see https://codemirror.net/docs/ref/#language.StreamParser
	 */
	get mediawiki(): StreamParser<State> {
		return {
			name: 'mediawiki',

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
				nVar: 0,
				lpar: false,
				lbrack: false,
				dt: {n: 0},
			}),

			copyState: (state): State => {
				const newState = copyState(state);
				newState.dt = {...state.dt};
				if (state.extMode && state.extMode.copyState) {
					newState.extState = state.extMode.copyState(state.extState as State);
				}
				return newState;
			},

			token: (stream, state): string => {
				let t: Token;
				if (this.oldTokens.length > 0) {
					// just send saved tokens till they exists
					t = this.oldTokens.shift()!;
					stream.pos = t.pos;
					return t.style;
				} else if (stream.sol()) {
					// reset bold and italic status in every new line
					state.dt.n = 0;
					this.isBold = false;
					this.isItalic = false;
					this.firstSingleLetterWord = null;
					this.firstMultiLetterWord = null;
					this.firstSpace = null;
				}
				let style: string,
					p: number | null = null,
					f: number | null;
				const tmpTokens: Token[] = [],
					readyTokens: Token[] = [];
				do {
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
								tmpTokens.length = 0;
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

			tokenTable: this.tokenTable,

			languageData: {
				commentTokens: {block: {open: '<!--', close: '-->'}} as CommentTokens,
				closeBrackets: {brackets: ['(', '[', '{', '"']} as CloseBracketConfig,
				autocomplete: this.completionSource,
			},
		};
	}

	get 'text/mediawiki'(): StreamParser<State> {
		return this.mediawiki;
	}
}

for (const [language, parser] of Object.entries(plugins)) {
	if (language === 'css' || language === 'javascript') {
		Object.defineProperty(MediaWiki.prototype, language, {
			get() {
				return parser;
			},
		});
	}
}

/**
 * Gets a LanguageSupport instance for the MediaWiki mode.
 * @param config Configuration for the MediaWiki mode
 */
export const mediawiki = (config: MwConfig): LanguageSupport => {
	const mode = new MediaWiki(config),
		lang = StreamLanguage.define(mode.mediawiki),
		highlighter = syntaxHighlighting(HighlightStyle.define(mode.getTagStyles()) as Highlighter);
	return new LanguageSupport(lang, highlighter);
};

/**
 * Gets a LanguageSupport instance for the mixed MediaWiki-HTML mode.
 * @param config Configuration for the MediaWiki mode
 */
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
	permittedHtmlTags: [
		'html',
		'base',
		'title',
		'menu',
		'a',
		'area',
		'audio',
		'map',
		'track',
		'video',
		'embed',
		'iframe',
		'object',
		'picture',
		'source',
		'canvas',
		'col',
		'colgroup',
		'tbody',
		'tfoot',
		'thead',
		'button',
		'datalist',
		'fieldset',
		'form',
		'input',
		'label',
		'legend',
		'meter',
		'optgroup',
		'option',
		'output',
		'progress',
		'select',
		'textarea',
		'details',
		'dialog',
		'slot',
		'template',
		'dir',
		'frame',
		'frameset',
		'marquee',
		'param',
		'xmp',
	],
	implicitlyClosedHtmlTags: [
		'area',
		'base',
		'col',
		'embed',
		'frame',
		'input',
		'param',
		'source',
		'track',
	],
});
