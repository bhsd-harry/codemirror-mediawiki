import {
	CodeMirror6,
	registerCSS,
	registerHTML,
	registerJSON,
	registerJavaScript,
	registerLua,
	registerMediaWiki,
	registerVue,
	registerAbuseFilter,
	registerTheme,
	registerBidiIsolates,
	nord,
} from '/codemirror-mediawiki/dist/main.min.js';
import {linkSuggest, paramSuggest} from './suggest.test';
import type {ConfigData} from 'wikiparser-node';
import type {Dialect} from '@bhsd/lezer-abusefilter';
import type {MwConfig, LintSource} from '/codemirror-mediawiki/src/index';

registerCSS();
registerHTML();
registerJSON();
registerJavaScript();
registerLua();
registerMediaWiki('https://www.mediawiki.org/wiki/');
registerVue();
registerAbuseFilter();
registerTheme('nord', nord);
registerBidiIsolates();

const abusefilterDialect: Dialect = {
	functions: [
		'lcase',
		'ucase',
		'length',
		'string',
		'int',
		'float',
		'bool',
		'norm',
		'ccnorm',
		'ccnorm_contains_any',
		'ccnorm_contains_all',
		'specialratio',
		'rmspecials',
		'rmdoubles',
		'rmwhitespace',
		'count',
		'rcount',
		'get_matches',
		'ip_in_range',
		'ip_in_ranges',
		'contains_any',
		'contains_all',
		'equals_to_any',
		'substr',
		'strlen',
		'strpos',
		'str_replace',
		'str_replace_regexp',
		'rescape',
		'set',
		'set_var',
		'sanitize',
	],
	deprecated: [
		'article_text',
		'article_prefixedtext',
		'article_namespace',
		'article_articleid',
		'article_restrictions_edit',
		'article_restrictions_move',
		'article_restrictions_create',
		'article_restrictions_upload',
		'article_recent_contributors',
		'article_first_contributor',
		'moved_from_text',
		'moved_from_prefixedtext',
		'moved_from_articleid',
		'moved_to_text',
		'moved_to_prefixedtext',
		'moved_to_articleid',
		'all_links',
		'board_articleid',
		'board_text',
		'board_prefixedtext',
	],
	disabled: [
		'old_text',
		'old_html',
		'minor_edit',
	],
	variables: [
		'timestamp',
		'accountname',
		'action',
		'added_lines',
		'edit_delta',
		'edit_diff',
		'new_size',
		'old_size',
		'new_content_model',
		'old_content_model',
		'removed_lines',
		'summary',
		'page_id',
		'page_namespace',
		'page_title',
		'page_prefixedtitle',
		'page_age',
		'page_last_edit_age',
		'moved_from_id',
		'moved_from_namespace',
		'moved_from_title',
		'moved_from_prefixedtitle',
		'moved_from_age',
		'moved_from_last_edit_age',
		'moved_to_id',
		'moved_to_namespace',
		'moved_to_title',
		'moved_to_prefixedtitle',
		'moved_to_age',
		'moved_to_last_edit_age',
		'user_editcount',
		'user_age',
		'user_unnamed_ip',
		'user_name',
		'user_type',
		'user_groups',
		'user_rights',
		'user_blocked',
		'user_emailconfirm',
		'old_wikitext',
		'new_wikitext',
		'added_links',
		'removed_links',
		'old_links',
		'new_links',
		'new_pst',
		'edit_diff_pst',
		'added_lines_pst',
		'new_text',
		'new_html',
		'page_restrictions_edit',
		'page_restrictions_move',
		'page_restrictions_create',
		'page_restrictions_upload',
		'page_recent_contributors',
		'page_first_contributor',
		'moved_from_restrictions_edit',
		'moved_from_restrictions_move',
		'moved_from_restrictions_create',
		'moved_from_restrictions_upload',
		'moved_from_recent_contributors',
		'moved_from_first_contributor',
		'moved_to_restrictions_edit',
		'moved_to_restrictions_move',
		'moved_to_restrictions_create',
		'moved_to_restrictions_upload',
		'moved_to_recent_contributors',
		'moved_to_first_contributor',
		'file_sha1',
		'file_size',
		'file_mime',
		'file_mediatype',
		'file_width',
		'file_height',
		'file_bits_per_channel',
		'wiki_name',
		'wiki_language',
		'user_mobile',
		'translate_source_text',
		'translate_target_language',
		'board_id',
		'board_namespace',
		'board_title',
		'board_prefixedtitle',
		'tor_exit_node',
		'global_user_groups',
		'global_user_editcount',
		'global_account_groups',
		'global_account_editcount',
		'user_app',
		'oauth_consumer',
		'ip_reputation_tunnel_operators',
		'ip_reputation_risk_types',
		'ip_reputation_client_proxies',
		'ip_reputation_client_behaviors',
		'ip_reputation_client_count',
		'ip_reputation_ipoid_known',
	],
};

if (location.pathname.startsWith('/codemirror-mediawiki')) {
	// 初始化DOM元素
	const textarea = document.querySelector<HTMLTextAreaElement>('#wpTextbox')!,
		languages = [...document.querySelectorAll<HTMLInputElement>('input[name="language"]')],
		extensions = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')],
		indent = document.querySelector<HTMLInputElement>('#indent')!,
		search = new URLSearchParams(location.search);
	if (search.has('rtl')) {
		textarea.dir = 'rtl';
	}
	if (search.has('indent')) {
		indent.value = search.get('indent')!;
	}
	for (const extension of extensions) {
		extension.checked = search.has(extension.id);
	}

	const mediawikiOnly = ['escape', 'refHover', 'hover', 'signatureHelp', 'inlayHints', 'openLinks'],
		cssOnly = ['colorPicker'],
		cssLangs = new Set(['css', 'vue', 'html']),
		cm = new CodeMirror6(textarea),
		linters: Record<string, LintSource | undefined> = {};
	let config: MwConfig | Dialect | undefined,
		mwConfig: MwConfig | undefined,
		fetchConfig: Promise<ConfigData> | undefined;

	/**
	 * 设置语言
	 * @param lang 语言
	 */
	const init = async (lang: string): Promise<void> => {
		const isMediaWiki = lang === 'mediawiki',
			display = isMediaWiki ? '' : 'none',
			cssDisplay = isMediaWiki || cssLangs.has(lang) ? '' : 'none',
			selector = '.fieldLayout';
		let parserConfig: ConfigData | undefined;
		for (const id of mediawikiOnly) {
			document.getElementById(id)!.closest<HTMLElement>(selector)!.style.display = display;
		}
		for (const id of cssOnly) {
			document.getElementById(id)!.closest<HTMLElement>(selector)!.style.display = cssDisplay;
		}
		if (isMediaWiki || lang === 'html') {
			fetchConfig ??= (async () => (await fetch('/wikiparser-node/config/default.json')).json())();
			parserConfig = await fetchConfig;
			if (!mwConfig) {
				mwConfig = {
					...CodeMirror6.getMwConfig(parserConfig),
					linkSuggest,
					paramSuggest,
				};
				Object.assign(cm, {mwConfig});
			}
			config = mwConfig;
		} else if (lang === 'abusefilter') {
			config = abusefilterDialect;
		}
		await cm.setLanguage(lang, config);
		if (search.get('lint') !== '0' && !(lang in linters)) {
			linters[lang] = await cm.getLinter();
			if (isMediaWiki && typeof wikiparse === 'object') {
				wikiparse.setConfig(Object.assign(await wikiparse.getConfig(), parserConfig!));
			}
			if (linters[lang]) {
				cm.lint(linters[lang]);
			}
		}
	};

	/**
	 * 更新search
	 * @param key 键
	 * @param value 值
	 */
	const updateSearch = (key: string, value: string | number): void => {
		const url = new URL(location.href);
		if (value) {
			url.searchParams.set(key, String(value));
		} else {
			url.searchParams.delete(key);
		}
		history.replaceState(null, '', url.toString()); // eslint-disable-line no-restricted-globals
	};

	/** 设置扩展 */
	const prefer = function(this: HTMLInputElement): void {
		const {id, checked} = this;
		if (id === 'dark') {
			cm.setTheme(checked ? 'nord' : 'light');
		} else {
			cm.prefer({[id]: checked});
		}
		updateSearch(id, Number(checked));
	};

	/** 设置缩进 */
	const indentChange = (): void => {
		const {value} = indent;
		cm.setIndent(value || '\t');
		updateSearch('indent', value);
	};

	// 初始化语言
	for (const input of languages) {
		input.addEventListener('change', () => {
			void init(input.id);
			// eslint-disable-next-line no-restricted-globals
			history.replaceState(
				null,
				'',
				`#${input.id.charAt(0).toUpperCase()}${input.id.slice(1)}`,
			);
		});
		if (input.checked) {
			void init(input.id);
		}
	}
	const hashMap = new Map([
		['wiki', 'mediawiki'],
		['wikitext', 'mediawiki'],
		['mediawiki', 'mediawiki'],
		['javascript', 'javascript'],
		['js', 'javascript'],
		['css', 'css'],
		['lua', 'lua'],
		['json', 'json'],
		['vue', 'vue'],
		['html', 'html'],
		['abusefilter', 'abusefilter'],
	]);
	addEventListener('hashchange', () => {
		const target = hashMap.get(location.hash.slice(1).toLowerCase()),
			element = languages.find(({id}) => id === target);
		if (element) {
			element.checked = true;
			element.dispatchEvent(new Event('change'));
		}
	});
	dispatchEvent(new HashChangeEvent('hashchange'));

	// 初始化扩展
	for (const extension of extensions) {
		extension.addEventListener('change', prefer);
	}
	cm.prefer(extensions.filter(({checked, id}) => checked && id !== 'dark').map(({id}) => id));
	cm.prefer({bidiIsolates: true});
	if (extensions.some(({checked, id}) => checked && id === 'dark')) {
		cm.setTheme('nord');
	}

	// 初始化缩进
	indent.addEventListener('change', indentChange);
	indentChange();

	Object.assign(globalThis, {cm});
}
