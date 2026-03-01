import {readFileSync} from 'fs';
import {profile} from '@bhsd/nodejs';
import parse from './parser';

const content = readFileSync('test/page.wiki', 'utf8'),
	[,, count] = process.argv;

(async () => {
	await profile(
		() => {
			console.time('parser');
			for (let i = 0; i < (Number(count) || 10); i++) {
				parse(content);
			}
			console.timeEnd('parser');
		},
		'test',
	);
})();
