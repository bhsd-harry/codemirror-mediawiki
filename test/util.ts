import {EditorState} from '@codemirror/state';
import * as config from 'wikiparser-node/config/default.json';
import {tagModes, getStaticMwConfig} from '../src/static';
import {mediawiki} from '../src/mediawiki';
import type {ConfigData} from 'wikiparser-node';

export const mwConfig = getStaticMwConfig(config as unknown as ConfigData, tagModes);

export const createState = (doc: string): EditorState => EditorState.create({
	doc,
	extensions: [mediawiki(mwConfig)],
});
