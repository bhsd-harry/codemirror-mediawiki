import {readFileSync} from 'fs';
import parser from './parser';

const content = readFileSync('test/page.wiki', 'utf8');
console.time('parser');
parser.parse(content);
console.timeEnd('parser');
