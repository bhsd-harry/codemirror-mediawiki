import {execute} from '@bhsd/common/dist/test';
import parse, {checkNode} from './parser';

void execute(content => {
	let node = parse(content);
	while (node) {
		checkNode(node);
		node = node.nextSibling;
	}
});
