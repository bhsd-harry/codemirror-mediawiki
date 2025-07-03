import {FullMediaWiki} from '../src/mediawiki';
import {mwConfig, autocompletionTest} from './util';

const mediawiki = new FullMediaWiki(mwConfig);

const mockTest = autocompletionTest(mediawiki.completionSource);

describe('autocompletion', () => {
	it('parser function name', async () => {
		await mockTest(
			'{{ uc',
			{
				from: 3,
				options: [
					{label: 'ucfirst', type: 'function'},
					{label: 'uc', type: 'function'},
				],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
		await mockTest(
			'{{ full',
			{
				from: 3,
				options: [
					{label: 'fullurl', type: 'function'},
					{label: 'fullurle', type: 'function'},
					{label: 'FULLPAGENAME', type: 'constant'},
					{label: 'FULLPAGENAMEE', type: 'constant'},
				],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
		await mockTest(
			'{{ #sw',
			{
				from: 3,
				options: [{label: '#switch', type: 'function'}],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
	});
	it('tag attribute', async () => {
		await mockTest(
			'<p da',
			{
				from: 3,
				options: [
					{label: 'datatype', type: 'property'},
					{label: 'data-', type: 'variable', detail: '*'},
				],
				validFor: /^[a-z]*$/iu,
			},
		);
		await mockTest(
			'<poem c',
			{
				from: 6,
				options: [
					{label: 'class', type: 'property'},
					{label: 'compact', type: 'property'},
				],
				validFor: /^[a-z]*$/iu,
			},
		);
		await mockTest(
			'<ref n',
			{
				from: 5,
				options: [{label: 'name', type: 'property'}],
				validFor: /^[a-z]*$/iu,
			},
		);
	});
	it('table attribute', async () => {
		await mockTest(
			'{| st',
			{
				from: 3,
				options: [{label: 'style', type: 'property'}],
				validFor: /^[a-z]*$/iu,
			},
		);
		await mockTest(
			`{|
|- cl`,
			{
				from: 6,
				options: [{label: 'class', type: 'property'}],
				validFor: /^[a-z]*$/iu,
			},
		);
		await mockTest(
			`{|
! ro`,
			{
				from: 5,
				options: [
					{label: 'role', type: 'property'},
					{label: 'rowspan', type: 'property'},
				],
				validFor: /^[a-z]*$/iu,
			},
		);
	});
	it('behavior switch', async () => {
		await mockTest(
			'__t',
			{
				from: 0,
				options: [{label: '__toc__', type: 'constant'}],
				validFor: /^[\p{L}\p{N}]*$/u,
			},
		);
		await mockTest(
			'__in',
			{
				from: 0,
				options: [{label: '__INDEX__', type: 'constant'}],
				validFor: /^[\p{L}\p{N}]*$/u,
			},
		);
	});
	it('closing tag', async () => {
		await mockTest(
			'<poem><p></p',
			{
				from: 11,
				options: [
					{label: 'p', type: 'type', boost: 99, apply: 'p>'},
					{label: 'poem', type: 'type', boost: 50, apply: 'poem>'},
				],
				validFor: /^[a-z\d]*$/iu,
			},
		);
		await mockTest(
			'<poem></p',
			{
				from: 8,
				options: [
					{label: 'p', type: 'type', apply: 'p>'},
					{label: 'poem', type: 'type', boost: 50, apply: 'poem>'},
				],
				validFor: /^[a-z\d]*$/iu,
			},
		);
		await mockTest(
			'<references></re',
			{
				from: 14,
				options: [{label: 'references', type: 'type', boost: 50, apply: 'references>'}],
				validFor: /^[a-z\d]*$/iu,
			},
		);
	});
	it('opening tag', async () => {
		await mockTest(
			'<im',
			{
				from: 1,
				options: [
					{label: 'img', type: 'type'},
					{label: 'imagemap', type: 'type'},
				],
				validFor: /^[a-z\d]*$/iu,
			},
		);
		await mockTest(
			'<imagemap><im',
			{
				from: 11,
				options: [{label: 'img', type: 'type'}],
				validFor: /^[a-z\d]*$/iu,
			},
		);
	});
	it('image parameter', async () => {
		await mockTest(
			'[[file:a|thumbn',
			{
				from: 9,
				options: [
					{label: 'thumbnail', type: 'keyword'},
					{label: 'thumbnail=', type: 'property', detail: '$1'},
				],
				validFor: /^[^|{}<>[\]$]*$/u,
			},
		);
	});
	it('URL protocol', async () => {
		await mockTest(
			'[gi',
			{
				from: 1,
				options: [{label: 'git://', type: 'namespace'}],
				validFor: /^[a-z:/]*$/iu,
			},
		);
	});
});
