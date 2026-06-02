import {CodeMirror6} from '/codemirror-mediawiki/dist/demo.min.js';
import {
	prepareDoneBtn,
	hideOptGroup,
	addOption,
	changeHandler,
	hashChangeHandler,
	inputHandler,
} from '/wikiparser-node/extensions/dist/test-page-common.js';
import type {ConfigData} from 'wikiparser-node';

declare interface Test {
	desc: string;
	wikitext?: string;
}

(async () => {
	const tests: Test[] = await (await fetch('./test/parserTests.json')).json(),
		key = 'codemirror-mediawiki-done',
		dones = new Set(JSON.parse(localStorage.getItem(key)!) as string[]),
		input = document.getElementById('search') as HTMLInputElement,
		select = document.querySelector('select')!,
		btn = document.querySelector('button')!,
		textarea = document.querySelector('textarea')!,
		pre = document.querySelector('pre')!;
	wikiparse.setConfig(await (await fetch('/wikiparser-node/config/default.json')).json() as ConfigData);
	const cm = new CodeMirror6(textarea, 'mediawiki', CodeMirror6.getMwConfig(await wikiparse.getConfig()));
	Object.assign(globalThis, {cm});
	await wikiparse.highlight!(pre, false, true);
	let optgroup: HTMLOptGroupElement | undefined;
	for (let i = 0; i < tests.length; i++) {
		optgroup = addOption(optgroup, select, tests, dones, i);
	}
	hideOptGroup(optgroup);
	select.addEventListener('change', () => {
		cm.setContent(tests[Number(select.value)]!.wikitext!, true);
		changeHandler(pre, btn, select, tests);
	});
	prepareDoneBtn(btn, select, tests, dones, key);
	inputHandler(input, select, dones);
	hashChangeHandler(select, tests);
})();
