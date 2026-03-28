import {StreamLanguage} from '@codemirror/language';
import {lilypond} from '../src/lilypond';
import {extData} from '../src/constants';

extData['score'] = new Set(require('wikiparser-node/data/ext/score.json') as string[]);

const {parser} = StreamLanguage.define(lilypond);

export default (text: string): void => {
	parser.parse(text);
};
