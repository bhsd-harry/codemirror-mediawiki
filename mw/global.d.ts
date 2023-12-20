import { CodeMirror6 as CodeMirror } from '../src/codemirror';
import 'types-mediawiki';

declare global {
	module 'https://*' {
		class CodeMirror6 extends CodeMirror {}
	}
}
