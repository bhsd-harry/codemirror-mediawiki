import * as assert from 'assert';
import {detectIndent} from '../src/indent';

const mockTest = (text: string, result: string): void => {
	assert.strictEqual(detectIndent(text, '', 'css'), result);
};

describe('smart indentation', () => {
	it('detect indentation', () => {
		mockTest(' a\n  ', '');
		mockTest('a\n   b\n      c', '   ');
		mockTest('a\n\tb\n\t\tc', '\t');
	});
});
