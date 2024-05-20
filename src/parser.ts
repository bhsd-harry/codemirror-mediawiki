import {StreamLanguage} from '@codemirror/language';
import {MediaWiki} from './mediawiki';
import {getStaticMwConfig} from './static';
import * as config from 'wikiparser-node/config/default.json';
import type {Config} from 'wikiparser-node';

const {parser} = StreamLanguage.define(new MediaWiki(getStaticMwConfig(config as unknown as Config)).mediawiki);

export default parser;
