import {CodeMirror6} from '../src/codemirror';
import 'types-mediawiki';

declare global {
	module 'https://*' {
		class CodeMirror extends CodeMirror6 {}
	}
}
