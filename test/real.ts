import {execute} from '@bhsd/test-util';
import parse, {checkNode} from './parser';

void execute(content => {
	let node = parse(content);
	while (node) {
		checkNode(node);
		node = node.nextSibling;
	}
});
