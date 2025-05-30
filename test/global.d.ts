import type {Parser} from '@lezer/common';
import type {Linter} from 'eslint';
import type {PublicApi} from 'stylelint';

declare global {
	module './*' {
		const parser: Parser;
		export default parser;
	}

	const eslint: {
		Linter: typeof Linter;
	};
	const stylelint: PublicApi;
}
