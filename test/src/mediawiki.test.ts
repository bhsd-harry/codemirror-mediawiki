import * as assert from 'assert';
import {FullMediaWiki, apply, applyDisplayLabel, hasTag} from '../../dist/mediawiki.js';
import {tokens} from '../../dist/config.js';
import {mwConfig, autocompletionTest, createDispatchableView} from './util.js';
import type {Completion, CompletionResult} from '@codemirror/autocomplete';
import type {TagName} from '../../dist/config';

const mediawiki = new FullMediaWiki(mwConfig);

const mockTest = autocompletionTest(mediawiki.completionSource);

const applyFunctionTest = (applyFunction: Exclude<Completion['apply'], string | undefined>) => async (
	doc: string,
	cursor: number,
	from: number,
	label: string,
	changes: (number | [number, ...string[]])[],
	selection: number | [number, number],
): Promise<void> => {
	const view = createDispatchableView(doc, [cursor], {changes, selection: [selection]});
	applyFunction(view, {label}, from, cursor);
	return view.dispatched;
};

const applyTest = applyFunctionTest(apply),
	applyDisplayLabelTest = applyFunctionTest(applyDisplayLabel);

const completion: Omit<CompletionResult, 'from'> = {
	options: [
		{label: 'a (article)', type: 'text'},
		{label: 'a (user)', displayLabel: 'Alice (user)', detail: '↲ a (user)', type: 'text'},
		{label: 'a (user)', type: 'redirect', detail: '↳ Alice (user)'},
		{label: 'a (disambiguation)', type: 'redirect', detail: '↳ Help:a'},
	],
	validFor: /^[^|{}<>[\]#]*$/u,
};

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
					{label: 'full', type: 'type'},
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
				...completion,
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
				...completion,
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
				...completion,
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
		await mockTest(
			'<templatestyles src="a',
			{
				from: 21,
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
					{label: 'parameter without detail or info=', type: 'variable', section: sections[3]},
					{
						label: 'parameter with detail and info=',
						type: 'variable',
						detail: '2nd parameter',
						info: 'a required parameter',
						section: sections[0],
					},
					{
						label: 'argument with detail and info=',
						type: 'variable',
						detail: '2nd parameter',
						info: 'a required parameter',
						section: sections[0],
					},
					{
						label: 'parameter with info=',
						type: 'variable',
						info: 'a suggested parameter',
						section: sections[1],
					},
					{
						label: 'argument with info=',
						type: 'variable',
						info: 'a suggested parameter',
						section: sections[1],
					},
					{label: 'parameter with detail=', type: 'variable', detail: '4th parameter', section: sections[2]},
				],
				validFor: /^[^|{}=]*$/u,
			},
		);
		await mockTest(
			'{{template| a',
			{
				from: 12,
				options: [
					{
						label: 'argument with detail and info=',
						type: 'variable',
						detail: '2nd parameter',
						info: 'a required parameter',
						section: sections[0],
					},
					{
						label: 'argument with info=',
						type: 'variable',
						info: 'a suggested parameter',
						section: sections[1],
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

describe('apply link completion', () => {
	it('Lowercase', async () => {
		await applyTest('[[f|', 3, 2, 'Foo', [2, [1, 'Foo'], 1], 5);
	});
	it('pipe', async () => {
		await applyTest('[[F', 3, 2, 'Foo', [2, [1, 'Foo|Foo]]']], [6, 9]);
		await applyTest('[[F]]', 3, 2, 'Foo', [2, [1, 'Foo|Foo'], 2], [6, 9]);
	});
});

describe('apply page completion', () => {
	it('template', async () => {
		await applyDisplayLabelTest('{{f', 3, 2, 'Foo', [2, [1, 'Foo']], 5);
		await applyDisplayLabelTest('{{:f', 4, 3, 'Foo', [3, [1, 'Foo']], 6);
	});
	it('parser function', async () => {
		await applyDisplayLabelTest(
			'{{#ifexist: f',
			13,
			12,
			'Foo',
			[12, [1, 'Foo']],
			15,
		);
		await applyDisplayLabelTest(
			'{{filepath: f',
			13,
			12,
			'Foo',
			[12, [1, 'Foo']],
			15,
		);
		await applyDisplayLabelTest('{{int: f', 8, 7, 'Foo', [7, [1, 'Foo']], 10);
		await applyDisplayLabelTest('{{raw: f', 8, 7, 'Foo', [7, [1, 'Foo']], 10);
		await applyDisplayLabelTest(
			'{{#widget: f',
			12,
			11,
			'Foo',
			[11, [1, 'Foo']],
			14,
		);
		await applyDisplayLabelTest(
			'{{#invoke: f',
			12,
			11,
			'Foo',
			[11, [1, 'Foo']],
			14,
		);
	});
	it('gallery', async () => {
		await applyDisplayLabelTest('<gallery>f', 10, 9, 'Foo', [9, [1, 'Foo']], 12);
	});
});

describe('util functions', () => {
	it('has tag', () => {
		const types = new Set([tokens.em, tokens.error]),
			typesStr = [...types].join('_');
		const yes = (tag: string | string[]): void => {
				assert.ok(hasTag(types, tag as TagName | TagName[]));
				assert.ok(hasTag(typesStr, tag as TagName | TagName[]));
			},
			no = (tag: string | string[]): void => {
				assert.ok(!hasTag(types, tag as TagName | TagName[]));
				assert.ok(!hasTag(typesStr, tag as TagName | TagName[]));
			};
		yes(tokens.em);
		yes(tokens.error);
		yes('em');
		yes('error');
		no(tokens.strong);
		no('strong');
		yes([tokens.em, tokens.strong]);
		yes(['em', 'strong']);
		no([tokens.strong, 'list']);
		no(['strong', 'list']);
	});
});
