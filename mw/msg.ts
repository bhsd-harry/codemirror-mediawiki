import type {CodeMirror} from './base';

export const REPO_CDN = 'npm/@bhsd/codemirror-mediawiki@2.6.10',
	curVersion = REPO_CDN.slice(REPO_CDN.lastIndexOf('@') + 1);

const {vendor, userAgent, maxTouchPoints, platform} = navigator;

export const isMac = vendor.includes('Apple Computer') && (userAgent.includes('Mobile/') || maxTouchPoints > 2)
	|| platform.includes('Mac');

const storageKey = 'codemirror-mediawiki-i18n',
	languages: Record<string, string> = {
		zh: 'zh-hans',
		'zh-hans': 'zh-hans',
		'zh-cn': 'zh-hans',
		'zh-my': 'zh-hans',
		'zh-sg': 'zh-hans',
		'zh-hant': 'zh-hant',
		'zh-tw': 'zh-hant',
		'zh-hk': 'zh-hant',
		'zh-mo': 'zh-hant',
	},
	lang = languages[mw.config.get('wgUserLanguage')] || 'en';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getObject = (key: string): any => JSON.parse(String(localStorage.getItem(key)));
export const setObject = (key: string, value: unknown): void => {
	localStorage.setItem(key, JSON.stringify(value));
};

/** 预存的I18N，可以用于判断是否是首次安装 */
export const i18n: Record<string, string> = getObject(storageKey) || {};

const {version} = i18n;

/**
 * 加载 I18N
 * @param CDN CDN地址
 */
export const setI18N = async (CDN: string): Promise<void> => {
	if (i18n['lang'] !== lang || version !== curVersion) {
		try {
			Object.assign(i18n, await (await fetch(`${CDN}/${REPO_CDN}/i18n/${lang}.json`)).json());
			setObject(storageKey, i18n);
		} catch (e) {
			void mw.notify(msg('i18n-failed', lang), {type: 'error'});
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
 * 解析I18N消息
 * @param key 消息键，省略`cm-mw-`前缀
 * @param text 是否输出为文本
 */
function parseMsg(key: string): JQuery<HTMLElement>;
function parseMsg(key: string, text: true): string;
function parseMsg(key: string, text?: boolean): string | JQuery<HTMLElement> {
	return mw.message(`cm-mw-${key}`)[text ? 'parse' : 'parseDom']();
}
export {parseMsg};

/**
 * 解析版本号
 * @param v 版本号
 */
const parseVersion = (v: string): [number, number] => v.split('.', 2).map(Number) as [number, number];

/**
 * 创建气泡提示消息
 * @param key 消息键，省略`cm-mw-`前缀
 * @param args 替换`$1`等的参数
 */
const notify = async (key: string, ...args: string[]): Promise<JQuery<HTMLElement>> => {
	const $p = $('<p>', {html: msg(key, ...args)});
	await mw.notify($p, {type: 'success', autoHideSeconds: 'long'});
	return $p;
};

/**
 * 欢迎消息
 * @param baseVersion 首次加入新插件的版本
 * @param addons 新插件
 */
export const welcome = async (baseVersion: string, addons: string[]): Promise<void> => {
	let notification: JQuery<HTMLElement> | undefined;
	if (!version) { // 首次安装
		notification = await notify('welcome');
	} else if (addons.length > 0) { // 更新版本
		const [baseMajor, baseMinor] = parseVersion(baseVersion),
			[major, minor] = parseVersion(version);
		if (major < baseMajor || major === baseMajor && minor < baseMinor) {
			notification = await notify(
				'welcome-addons',
				curVersion,
				String(addons.length),
				addons.map(addon => `<li>${parseMsg(`addon-${addon}`, true)}</li>`).join(''),
			);
		}
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
	const obj: Record<string, string> = {};
	for (const [k, v] of Object.entries(i18n)) {
		if (k.startsWith('phrase-')) {
			obj[k.slice(7).replace(/-/gu, ' ')] = v;
		}
	}
	cm.localize(obj);
};
