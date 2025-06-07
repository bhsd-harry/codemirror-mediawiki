import {readFileSync} from 'fs';
import parse from './parser';

const content = readFileSync('test/page.wiki', 'utf8');
console.time('parser');
for (let i = 0; i < 10; i++) {
	parse(content);
}
console.timeEnd('parser');
