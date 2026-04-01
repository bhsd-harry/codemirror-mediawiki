import * as assert from 'assert';
import {encapsulateLines} from '../../dist/keybindings.js';

let text = '= a = \n \n b ';

const mockTest = (pre: string, post: string, result: string): void => {
	text = encapsulateLines(text, pre, post);
	assert.strictEqual(text, result);
};

describe('keybindings', () => {
	it('encapsulateLines', () => {
		mockTest('== ', ' ==', '== a ==\n\n== b ==');
		mockTest(' ', '', ' a\n \n b');
	});
});
