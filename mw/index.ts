import {CDN} from '@bhsd/browser';
import {CodeMirror} from './codemirror';
import {msg, setI18N, welcome, localize} from './msg';
import {openPreference} from './preference';
import {instances} from './util';

declare const $STYLE: string;

// 每次新增插件都需要修改这里
const baseVersion = '3.5',
	addons = ['lint'];

mw.loader.addStyleTag($STYLE);

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
		setI18N(mw.libs.wphl?.CDN || CDN),
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
		void openPreference();
	});
	void welcome(baseVersion, addons);
})();

Object.assign(globalThis, {CodeMirror6: CodeMirror});

export {CodeMirror};
