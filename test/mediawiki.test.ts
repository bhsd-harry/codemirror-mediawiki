import {FullMediaWiki} from '../src/mediawiki';
import {mwConfig, autocompletionTest} from './util';

const mediawiki = new FullMediaWiki(mwConfig);

const mockTest = autocompletionTest(mediawiki.completionSource);

describe('autocompletion', () => {
	it('parser function/template name', async () => {
		await mockTest(
			'{{ full',
			{
				from: 3,
				options: [
					{label: 'fullurl', type: 'function'},
					{label: 'fullurle', type: 'function'},
					{label: 'FULLPAGENAME', type: 'constant'},
					{label: 'FULLPAGENAMEE', type: 'constant'},
					{label: 'full', type: 'text'},
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
		await mockTest(
			'{{ :a',
			{
				from: 4,
				options: [
					{label: 'a (article)', type: 'text'},
					{label: 'a (user)', type: 'text'},
				],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
		await mockTest(
			'{{ help:a',
			{
				from: 8,
				options: [{label: 'a (help)', type: 'text'}],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
		await mockTest('{{ >', null);
	});
	it('page', async () => {
		await mockTest(
			'{{#ifexist: a',
			{
				from: 12,
				options: [
					{label: 'a (article)', type: 'text'},
					{label: 'a (user)', type: 'text'},
				],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
		await mockTest(
			'{{filepath: a',
			{
				from: 12,
				options: [{label: 'a (file)', type: 'text'}],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
		await mockTest(
			'{{int: a',
			{
				from: 7,
				options: [{label: 'a (mediawiki)', type: 'text'}],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
		await mockTest(
			'{{raw: a',
			{
				from: 7,
				options: [{label: 'a (template)', type: 'text'}],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
		await mockTest(
			'{{#widget: a',
			{
				from: 11,
				options: [{label: 'a (widget)', type: 'text'}],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
		await mockTest(
			'{{#invoke: a',
			{
				from: 11,
				options: [{label: 'a (module)', type: 'text'}],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
		await mockTest(
			'[[ a',
			{
				from: 3,
				options: [
					{label: 'a (article)', type: 'text'},
					{label: 'a (user)', type: 'text'},
				],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
		await mockTest('[[ >', null);
		await mockTest(
			'<gallery> a',
			{
				from: 10,
				options: [{label: 'a', type: 'text'}],
				validFor: /^[^|{}<>[\]#]*$/u,
			},
		);
	});
	it('template parameter', async () => {
		const sections = [
			{name: 'Required', rank: 1},
			{name: 'Suggested', rank: 2},
			{name: 'Optional', rank: 3},
			{name: 'Deprecated', rank: 4},
		] as const;
		await mockTest(
			'{{template|',
			{
				from: 11,
				options: [
					{label: 'param1=', type: 'variable', section: sections[3]},
					{
						label: 'param2=',
						type: 'variable',
						detail: 'another parameter',
						info: 'a required parameter',
						section: sections[0],
					},
					{
						label: 'p2=',
						type: 'variable',
						detail: 'another parameter',
						info: 'a required parameter',
						section: sections[0],
					},
					{label: 'prm3=', type: 'variable', info: 'an optional parameter', section: sections[2]},
					{label: 'prm4=', type: 'variable', detail: '4th parameter', section: sections[2]},
				],
				validFor: /^[^|{}=]*$/u,
			},
		);
		await mockTest(
			'{{template| pa',
			{
				from: 12,
				options: [
					{label: 'param1=', type: 'variable', section: sections[3]},
					{
						label: 'param2=',
						type: 'variable',
						detail: 'another parameter',
						info: 'a required parameter',
						section: sections[0],
					},
				],
				validFor: /^[^|{}=]*$/u,
			},
		);
		await mockTest('{{template| p=', null);
	});
	it('tag attribute', async () => {
		await mockTest(
			'<meta i',
			{
				from: 6,
				options: [{label: 'itemprop', type: 'property'}],
				validFor: /^[a-z]*$/iu,
			},
		);
		await mockTest(
			'<langconvert t',
			{
				from: 13,
				options: [{label: 'to', type: 'property'}],
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
			'<time da',
			{
				from: 6,
				options: [
					{label: 'datatype', type: 'property'},
					{label: 'data-', type: 'variable', detail: '*'},
					{label: 'datetime', type: 'property'},
				],
				validFor: /^[a-z]*$/iu,
			},
		);
		await mockTest(
			'<p x',
			{
				from: 3,
				options: [{label: 'xmlns:', type: 'namespace', detail: '*'}],
				validFor: /^[a-z]*$/iu,
			},
		);
	});
	it('table attribute', async () => {
		await mockTest(
			'{| b',
			{
				from: 3,
				options: [
					{label: 'bgcolor', type: 'property'},
					{label: 'border', type: 'property'},
				],
				validFor: /^[a-z]*$/iu,
			},
		);
		await mockTest(
			`{|
|- v`,
			{
				from: 6,
				options: [{label: 'valign', type: 'property'}],
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
		await mockTest(
			`{|
|+ ro`,
			{
				from: 6,
				options: [{label: 'role', type: 'property'}],
				validFor: /^[a-z]*$/iu,
			},
		);
	});
	it('behavior switch', async () => {
		await mockTest(
			'__nog',
			{
				from: 0,
				options: [
					{label: '__nogallery__', type: 'constant'},
					{label: '__NOGLOBAL__', type: 'constant'},
				],
				validFor: /^[\p{L}\p{N}]*$/u,
			},
		);
	});
	it('closing tag', async () => {
		await mockTest(
			'<indicator><i></i',
			{
				from: 16,
				options: [
					{label: 'i', type: 'type', boost: 99, apply: 'i>'},
					{label: 'ins', type: 'type', apply: 'ins>'},
					{label: 'indicator', type: 'type', boost: 50, apply: 'indicator>'},
				],
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
					{label: 'imagemap', type: 'type'},
					{label: 'img', type: 'type'},
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
