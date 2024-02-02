import {CDN} from './base';

export const REPO_CDN = 'npm/@bhsd/codemirror-mediawiki@2.3.2';

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
	lang = languages[mw.config.get('wgUserLanguage')] || 'en',

	/** 预存的I18N，可以用于判断是否是首次安装 */
	i18n: Record<string, string> = JSON.parse(localStorage.getItem(storageKey)!) || {},
	{version} = i18n,
	curVersion = REPO_CDN.slice(REPO_CDN.lastIndexOf('@') + 1);

/** 加载 I18N */
export const setI18N = async (): Promise<void> => {
	if (i18n['lang'] !== lang || version !== curVersion) {
		try {
			Object.assign(i18n, await (await fetch(`${CDN}/${REPO_CDN}/i18n/${lang}.json`)).json());
			localStorage.setItem(storageKey, JSON.stringify(i18n));
		} catch (e) {
			void mw.notify(msg('i18n-failed', lang), {type: 'error'});
			console.error(e);
		}
	}
	for (const [k, v] of Object.entries(i18n)) {
		mw.messages.set(`cm-mw-${k}`, v);
	}
};

/**
 * 获取I18N消息
 * @param key 消息键，省略`cm-mw-`前缀
 * @param args 替换`$1`等的参数
 */
export const msg = (key: string, ...args: string[]): string => mw.msg(`cm-mw-${key}`, ...args);

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
				addons.map(addon => `<li>${msg(`addon-${addon}`)}</li>`).join(''),
			);
		}
	}
	notification?.find('#settings').click(e => {
		e.preventDefault();
		document.getElementById('cm-settings')!.dispatchEvent(new MouseEvent('click'));
	});
};
