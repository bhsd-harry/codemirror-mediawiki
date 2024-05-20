import type {Parser} from '@lezer/common';

declare global {
	module './*' {
		const parser: Parser;
		export default parser;
	}
}
