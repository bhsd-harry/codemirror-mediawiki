import * as assert from 'assert';
import {Text} from '@codemirror/state';
import {pos, getRange} from '../src/lintsource';

describe('lintsource position transformation', () => {
	it('standalone language', () => {
		const lua = `function test()
	return nil
end`,
			doc = Text.of(lua.split('\n'));
		assert.strictEqual(pos(doc, 2, 2), 17);
	});
	it('embedded language', () => {
		const html = `<script>
const test = () =>
	null;
</script>`,
			doc = Text.of(html.split('\n'));
		assert.strictEqual(pos(doc, 1, 6, 9), 14);
		assert.strictEqual(pos(doc, 2, 6, 9), 33);
	});
});

describe('lintsource range transformation', () => {
	it('standalone language', () => {
		const js = `const test = () =>
	null;`,
			doc = Text.of(js.split('\n'));
		assert.deepStrictEqual(getRange(doc, 2, 6), {from: 24, to: 25});
		assert.deepStrictEqual(getRange(doc, 1, 6, 2, 6), {from: 5, to: 24});
	});
	it('embedded language', () => {
		const html = `<script>
const test = () =>
	null;
</script>`,
			doc = Text.of(html.split('\n'));
		assert.deepStrictEqual(
			getRange(doc, 2, 6, undefined, undefined, 9, 35),
			{from: 33, to: 34},
		);
		assert.deepStrictEqual(
			getRange(doc, 3, 1, undefined, undefined, 9, 35),
			{from: 35, to: 35},
		);
		assert.deepStrictEqual(
			getRange(doc, 1, 6, 2, 6, 9, 35),
			{from: 14, to: 33},
		);
	});
});
