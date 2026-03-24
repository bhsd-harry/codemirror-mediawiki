import {StreamLanguage} from '@codemirror/language';
import {json, jsonc} from '../src/json';

const jsonParser = StreamLanguage.define(json).parser,
	jsoncParser = StreamLanguage.define(jsonc).parser;

export default (text: string): void => {
	jsonParser.parse(text);
	jsoncParser.parse(text);
};
