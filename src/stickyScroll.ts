import {
	stickyScroll,
} from '@bhsd/codemirror-stickyscroll';
import type {Extension} from '@codemirror/state';

/**
 * Get the [stickyScroll](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#stickyscroll)
 * extension for Wikitext.
 * @since 0.12.0
 */
export default (
): Extension => [
	stickyScroll({
		excludeNode(
		) {
			return false;
		},
	}),
];
