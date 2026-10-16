import * as assert from 'assert';
import {describe, it} from '@bhsd/test-util/mocha';
import {tokens, hasTag} from '../../dist/config.js';
import type {TagName} from '../../dist/config';

describe('util functions', () => {
	it('has tag', () => {
		const types = new Set([tokens.em, tokens.error]),
			typesStr = [...types].join('_');
		const yes = (tag: string | string[]): void => {
				assert.ok(hasTag(types, tag as TagName | TagName[]));
				assert.ok(hasTag(typesStr, tag as TagName | TagName[]));
			},
			no = (tag: string | string[]): void => {
				assert.ok(!hasTag(types, tag as TagName | TagName[]));
				assert.ok(!hasTag(typesStr, tag as TagName | TagName[]));
			};
		yes(tokens.em);
		yes(tokens.error);
		yes('em');
		yes('error');
		no(tokens.strong);
		no('strong');
		yes([tokens.em, tokens.strong]);
		yes(['em', 'strong']);
		no([tokens.strong, 'list']);
		no(['strong', 'list']);
	});
});
