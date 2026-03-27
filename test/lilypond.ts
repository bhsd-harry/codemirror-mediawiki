import {StreamLanguage} from '@codemirror/language';
import {lilypond} from '../src/lilypond';

const {parser} = StreamLanguage.define(lilypond);

export default (text: string): void => {
	parser.parse(text);
};
