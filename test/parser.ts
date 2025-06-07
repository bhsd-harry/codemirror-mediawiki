import {StreamLanguage} from '@codemirror/language';
import {MediaWiki} from '../src/token';
import {mwConfig} from './util';
import type {SyntaxNode} from '@lezer/common';

const {parser} = StreamLanguage.define(new MediaWiki(mwConfig).mediawiki());

export const checkNode = ({name}: SyntaxNode): void | never => {
	if (name !== '_' && /^_|_$|__/u.test(name)) {
		throw new Error(`节点名包含过多的下划线：${name}`);
	}
};

export default (wikitext: string): SyntaxNode | null => parser.parse(wikitext).topNode.firstChild;
