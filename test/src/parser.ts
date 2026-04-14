import {StreamLanguage} from '@codemirror/language';
import {javascriptLanguage} from '@codemirror/lang-javascript';
import {cssLanguage} from '@codemirror/lang-css';
import {lua} from '@codemirror/legacy-modes/mode/lua';
import {MediaWiki} from '../../dist/token.js';
import {mwConfig} from './util.js';
import type {SyntaxNode} from '@lezer/common';

const {parser} = StreamLanguage.define(new MediaWiki(mwConfig).mediawiki());

export const checkNode = ({name}: SyntaxNode): void | never => {
	if (name !== '_' && /^_|_$|__/u.test(name)) {
		throw new Error(`节点名包含过多的下划线：${name}`);
	}
};

export default (wikitext: string): SyntaxNode | null => parser.parse(wikitext).topNode.firstChild;

export const parsers = {
	javascript: javascriptLanguage.parser,
	css: cssLanguage.parser,
	lua: StreamLanguage.define(lua).parser,
};
