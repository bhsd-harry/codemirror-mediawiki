import {StreamLanguage} from '@codemirror/language';
import {lilypond} from '../../dist/lilypond.js';
import {extData} from '../../dist/constants.js';
import score from 'wikiparser-node/data/ext/score.json' with {type: 'json'};

extData['score'] = new Set(score);

const {parser} = StreamLanguage.define(lilypond);

export default (text: string): void => {
	parser.parse(text);
};
