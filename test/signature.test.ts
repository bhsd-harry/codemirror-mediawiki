import * as assert from 'assert';
import {getSignatureHelp} from '../src/signature';

const signatures = [
	{
		label: '{{#foo:bar}}',
		parameters: [{label: 'bar'}],
	},
	{
		label: '{{#foo:bar|baz}}',
		parameters: [{label: 'bar'}, {label: 'baz'}],
	},
];

describe('signature help', () => {
	assert.strictEqual(
		getSignatureHelp({signatures, activeParameter: 0}),
		'{{#foo:<b>bar</b>}}<br>{{#foo:<b>bar</b>|baz}}',
	);
	assert.strictEqual(
		getSignatureHelp({signatures, activeParameter: 1}),
		'{{#foo:bar}}<br>{{#foo:bar|<b>baz</b>}}',
	);
	assert.strictEqual(
		getSignatureHelp({signatures, activeParameter: 2}),
		'{{#foo:bar}}<br>{{#foo:bar|baz}}',
	);
});
