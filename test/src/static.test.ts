import * as assert from 'assert';
import {getStaticMwConfig} from '../../dist/static.js';
import type {ConfigData} from 'wikiparser-node';
import type {MwConfig} from '../../dist/token';

const tagModes = {
		pre: 'text/pre',
		nowiki: 'text/nowiki',
	},
	variable = ['!', 'dir'],
	functionHook = ['lc', 'tag', 'dir'],
	nsid = {
		'': 0,
		file: 6,
	},
	variants = ['zh', 'zh-hans', 'zh-cn'],
	redirection = ['#redirect'];
const ref: Omit<ConfigData, 'html' | 'namespaces' | 'interwiki' | 'doubleUnderscore'> = {
	parserFunction: [
		{
			lc: 'lc',
			'#tag': 'tag',
		},
		{
			'!': '!',
			'#dir': 'dir',
		},
		['msg', 'raw'],
		['subst', 'safesubst'],
	],
	variable,
	functionHook,
	protocol: 'http://|mailto:',
	nsid,
	variants,
	redirection,
	ext: ['pre', 'nowiki'],
	img: {
		'alt=$1': 'alt',
		'thumb=$1': 'manualthumb',
		none: 'none',
		thumb: 'thumbnail',
	},
};
const config: MwConfig = {
	doubleUnderscore: [
		{
			__toc__: 'toc',
			'＿＿目次＿＿': 'toc',
		},
		{
			__INDEX__: 'INDEX',
			'＿＿インデックス＿＿': 'INDEX',
		},
	],
	tags: {pre: true, nowiki: true},
	tagModes,
	functionHooks: functionHook,
	variableIDs: variable,
	functionSynonyms: [
		{
			lc: 'lc',
			'#tag': 'tag',
			msg: 'msg',
			raw: 'raw',
			subst: 'subst',
			safesubst: 'safesubst',
		},
		{
			'!': '!',
			'#dir': 'dir',
		},
	],
	urlProtocols: 'http://|mailto:|//',
	nsid,
	imageKeywords: {
		'alt=$1': 'alt',
		'thumb=$1': 'manualthumb',
		none: 'none',
		thumb: 'thumbnail',
	},
	variants: [...variants, 'zh-Hans', 'zh-Hans-CN'],
	redirection,
};

const mockTest = (doubleUnderscore: ConfigData['doubleUnderscore']): void => {
	const data: Omit<ConfigData, 'html' | 'namespaces' | 'interwiki'> = {
		...ref,
		doubleUnderscore,
	};
	assert.deepStrictEqual(getStaticMwConfig(data as ConfigData, tagModes), config);
};

describe('get MediaWiki config', () => {
	it('up-to-date', () => {
		mockTest([
			[],
			[],
			{
				toc: 'toc',
				'＿＿目次＿＿': 'toc',
			},
			{
				INDEX: 'INDEX',
				'＿＿インデックス＿＿': 'INDEX',
			},
		]);
	});
});
