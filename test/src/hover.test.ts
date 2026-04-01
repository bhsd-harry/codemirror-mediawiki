import * as assert from 'assert';
import {getHoverFromApi, getDoc} from '../../dist/hover.js';
import {paramSuggest} from '../../dist/suggest.test.js';
import {createState} from './util.js';

const state = createState(
	`{{a
|parameter without detail or info=
|argument with detail and info=
|parameter with info=
|parameter with detail=
}}`,
);
const mockTest = async (pos: number, value?: string, range?: [number, number, number, number]): Promise<void> => {
	assert.deepStrictEqual(
		await getHoverFromApi(state, pos, -1, paramSuggest, true),
		range && {
			contents: {kind: 'plaintext', value},
			range: {start: {line: range[0], character: range[1]}, end: {line: range[2], character: range[3]}},
		},
	);
};

describe('hover from TemplateData API', () => {
	it('single entry of parameter hover', () => {
		assert.strictEqual(
			getDoc('Required', '<a>No HTML\n&\nXML</a>'),
			'&lt;a>No HTML<br>&amp;<br>XML&lt;/a><br><b><i>@required</i></b>',
		);
		assert.strictEqual(getDoc('Optional'), '');
		assert.strictEqual(getDoc('Suggested'), '<br><b><i>@suggested</i></b>');
	});

	it('template name hover', async () => {
		await mockTest(
			3,
			'<p>Example template</p>'
			+ '<h4>Required</h4>'
			+ '<ul>'
			// eslint-disable-next-line @stylistic/max-len
			+ '<li><code>parameter with detail and info</code>/<code>argument with detail and info</code> - a required parameter</li>'
			+ '</ul>'
			+ '<h4>Suggested</h4>'
			+ '<ul>'
			+ '<li><code>parameter with info</code>/<code>argument with info</code> - a suggested parameter</li>'
			+ '</ul>'
			+ '<h4>Optional</h4>'
			+ '<ul>'
			+ '<li><code>parameter with detail</code></li>'
			+ '</ul>'
			+ '<h4>Deprecated</h4>'
			+ '<ul>'
			+ '<li><code>parameter without detail or info</code></li>'
			+ '</ul>',
			[0, 2, 0, 3],
		);
	});

	it('template parameter hover', async () => {
		await mockTest(
			6,
			'<b><i>@deprecated</i></b>',
			[1, 1, 1, 34],
		);
		await mockTest(
			41,
			'a required parameter<br><b><i>@required</i></b>',
			[2, 1, 2, 31],
		);
		await mockTest(
			73,
			'a suggested parameter<br><b><i>@suggested</i></b>',
			[3, 1, 3, 21],
		);
		await mockTest(95);
	});
});
