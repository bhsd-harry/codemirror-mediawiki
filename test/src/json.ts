import {StreamLanguage} from '@codemirror/language';
import {jsonBasic, jsonc} from '../../dist/json.js';

const jsonParser = StreamLanguage.define(jsonBasic).parser,
	jsoncParser = StreamLanguage.define(jsonc).parser;

export default (text: string): void => {
	jsonParser.parse(text);
	jsoncParser.parse(text);
};
