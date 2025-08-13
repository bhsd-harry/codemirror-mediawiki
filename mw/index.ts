import {CDN} from '@bhsd/browser';
import {CodeMirror} from './codemirror';
import {instances} from './textSelection';
import {openPreference} from './preference';
import {msg, setI18N, welcome, REPO_CDN, localize} from './msg';

// 每次新增插件都需要修改这里
const baseVersion = '3.1',
	addons = ['escape'];

mw.loader.load(`${CDN}/${REPO_CDN}/mediawiki.css`, 'text/css');

/**
 * jQuery.val overrides for CodeMirror.
 */
$.valHooks['textarea'] = {
	get(elem: HTMLTextAreaElement): string {
		const cm = instances.get(elem);
		return cm?.visible ? cm.getContent() : elem.value;
	},
	set(elem: HTMLTextAreaElement, value: string): void {
		const cm = instances.get(elem);
		if (cm?.visible) {
			cm.setContent(value);
		} else {
			elem.value = value;
		}
	},
};

document.body.addEventListener('click', e => {
	if (e.target instanceof HTMLTextAreaElement && e.shiftKey && !instances.has(e.target)) {
		e.preventDefault();
		void CodeMirror.fromTextArea(e.target);
	}
});

(async () => {
	const portletContainer: Record<string, string> = {
		minerva: 'page-actions-overflow',
		moeskin: 'moe-global-toolbar:visible #p-tb,#moe-mobile-toolbar:visible',
		citizen: 'p-tb',
	};
	await Promise.all([
		mw.loader.using('mediawiki.util'),
		setI18N(CDN),
	]);
	mw.hook('wiki-codemirror6').add(localize);
	mw.hook('wiki-codemirror6.setting').add(localize);
	mw.util.addPortletLink(
		portletContainer[mw.config.get('skin')] ?? 'p-cactions',
		'#',
		msg('title'),
		'cm-settings',
	)!.addEventListener('click', e => {
		e.preventDefault();
		const selector = '.cm-editor+textarea,.monaco-container+textarea',
			textareas = [...document.querySelectorAll<HTMLTextAreaElement>(selector)];
		void openPreference(textareas.map(textarea => instances.get(textarea)));
	});
	void welcome(baseVersion, addons);
})();

Object.assign(globalThis, {CodeMirror6: CodeMirror});

export {CodeMirror};
