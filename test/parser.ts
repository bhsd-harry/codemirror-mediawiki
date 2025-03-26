import {StreamLanguage} from '@codemirror/language';
import {MediaWiki} from '../src/token';
import {tagModes, getStaticMwConfig} from '../src/static';
import * as config from 'wikiparser-node/config/default.json';
import type {SyntaxNode} from '@lezer/common';
import type {ConfigData} from 'wikiparser-node';

export const checkNode = ({name}: SyntaxNode): void | never => {
	if (name !== '_' && /^_|_$|__/u.test(name)) {
		throw new Error(`节点名包含过多的下划线：${name}`);
	}
};

export default StreamLanguage.define(
	new MediaWiki(getStaticMwConfig(config as unknown as ConfigData, tagModes)).mediawiki(),
).parser;
