import {getObject, compareVersion, setI18N as setI18NBase} from '@bhsd/common';
import {isMac} from '../src/openLinks';
import type {CodeMirror} from './codemirror';

const storageKey = 'codemirror-mediawiki-i18n';

export const REPO_CDN = 'npm/@bhsd/codemirror-mediawiki@2.29.1',
	curVersion = REPO_CDN.slice(REPO_CDN.lastIndexOf('@') + 1),
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	languages = mw.language?.getFallbackLanguageChain() ?? [mw.config.get('wgUserLanguage')],

	/** 预存的I18N，可以用于判断是否是首次安装 */
	i18n: Record<string, string> = getObject(storageKey) ?? {};

const {version} = i18n;

/**
 * 加载 I18N
 * @param CDN CDN地址
 */
export const setI18N = async (CDN: string): Promise<void> => {
	try {
		await setI18NBase(`${CDN}/${REPO_CDN}/i18n`, curVersion, languages, storageKey, i18n);
	} catch (e) {
		if (e instanceof Error) {
			void mw.notify(e.message, {type: 'error'});
			console.error(e);
		}
	}
	for (const [k, v] of Object.entries(i18n)) {
		if (!k.endsWith('-mac')) {
			mw.messages.set(`cm-mw-${k}`, v);
		} else if (isMac) {
			mw.messages.set(`cm-mw-${k.slice(0, -4)}`, v);
		}
	}
};

/**
 * 获取I18N消息
 * @param key 消息键，省略`cm-mw-`前缀
 * @param args 替换`$1`等的参数
 */
export const msg = (key: string, ...args: string[]): string => mw.msg(`cm-mw-${key}`, ...args);

/**
 * 为所有链接添加`target="_blank"`
 * @param $dom 容器
 */
const blankTarget = ($dom: JQuery): JQuery => {
	$dom.find('a').add($dom.filter('a')).attr('target', '_blank');
	return $dom;
};

/**
 * 解析I18N消息
 * @param key 消息键，省略`cm-mw-`前缀
 * @param text 是否输出为文本
 */
export function parseMsg(key: string, text: boolean): string;
export function parseMsg(key: string): JQuery;
export function parseMsg(key: string, text?: boolean): string | JQuery {
	const message = mw.message(`cm-mw-${key}`);
	return text ? message.parse() : blankTarget(message.parseDom());
}

/**
 * 创建气泡提示消息
 * @param key 消息键，省略`cm-mw-`前缀
 * @param args 替换`$1`等的参数
 */
const notify = async (key: string, ...args: string[]): Promise<JQuery> => {
	const $p = blankTarget($('<p>', {html: msg(key, ...args)}));
	await mw.notify($p, {type: 'success', autoHideSeconds: 'long'});
	return $p;
};

/**
 * 欢迎消息
 * @param baseVersion 首次加入新插件的版本
 * @param addons 新插件
 */
export const welcome = async (baseVersion: string, addons: string[]): Promise<void> => {
	let notification: JQuery | undefined;
	if (!version) { // 首次安装
		notification = await notify('welcome');
	} else if (addons.length > 0 && !compareVersion(version, baseVersion)) { // 更新版本
		notification = await notify(
			'welcome-addons',
			`<a href="https://github.com/bhsd-harry/codemirror-mediawiki/blob/npm/CHANGELOG.md#${
				curVersion.replace(/\./gu, '')
			}" target="_blank">${curVersion}</a>`,
			String(addons.length),
			addons.map(addon => `<li>${parseMsg(`addon-${addon}`, true)}</li>`).join(''),
		);
	}
	notification?.find('#settings').click(e => {
		e.preventDefault();
		document.getElementById('cm-settings')!.dispatchEvent(new MouseEvent('click'));
	});
};

/**
 * 本地化
 * @param cm
 */
export const localize = (cm: CodeMirror): void => {
	cm.localize(Object.fromEntries(
		Object.entries(i18n).filter(([k]) => k.startsWith('phrase-'))
			.map(([k, v]) => [k.slice(7).replace(/-/gu, ' '), v]),
	));
};
