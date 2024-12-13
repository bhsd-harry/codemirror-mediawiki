import {StreamLanguage} from '@codemirror/language';
import {MediaWiki} from '../src/token';
import {getStaticMwConfig} from '../src/static';
import * as config from 'wikiparser-node/config/default.json';
import type {SyntaxNode} from '@lezer/common';
import type {Config} from 'wikiparser-node';

export const checkNode = ({name}: SyntaxNode): void | never => {
	if (name !== '_' && /^_|_$|__/u.test(name)) {
		throw new Error(`节点名包含过多的下划线：${name}`);
	}
};

const {parser} = StreamLanguage.define(new MediaWiki(getStaticMwConfig(config as unknown as Config)).mediawiki());

export default parser;
