import { CodeMirror6, registerCSS, registerJSON, registerJavaScript, registerLua, registerMediaWiki, registerVue, } from '/codemirror-mediawiki/dist/main.min.js';
registerCSS();
registerJSON();
registerJavaScript();
registerLua();
registerMediaWiki();
registerVue();
(() => {
    if (!location.pathname.startsWith('/codemirror-mediawiki')) {
        return;
    }
    const textarea = document.querySelector('#wpTextbox'), languages = [...document.querySelectorAll('input[name="language"]')], extensions = [...document.querySelectorAll('input[type="checkbox"]')], indent = document.querySelector('#indent'), search = new URLSearchParams(location.search);
    if (search.has('rtl')) {
        textarea.dir = 'rtl';
    }
    if (search.has('indent')) {
        indent.value = search.get('indent');
    }
    for (const extension of extensions) {
        extension.checked = search.has(extension.id);
    }
    const mediawikiOnly = ['escape', 'refHover', 'hover', 'signatureHelp', 'inlayHints', 'openLinks'], cssOnly = ['colorPicker'], cm = new CodeMirror6(textarea), linters = {};
    let config, fetchConfig;
    const init = async (lang) => {
        const isMediaWiki = lang === 'mediawiki', display = isMediaWiki ? '' : 'none', cssDisplay = isMediaWiki || lang === 'css' || lang === 'vue' ? '' : 'none';
        let parserConfig;
        for (const id of mediawikiOnly) {
            document.getElementById(id).closest('.fieldLayout').style.display = display;
        }
        for (const id of cssOnly) {
            document.getElementById(id).closest('.fieldLayout').style.display = cssDisplay;
        }
        if (isMediaWiki) {
            fetchConfig !== null && fetchConfig !== void 0 ? fetchConfig : (fetchConfig = (async () => (await fetch('/wikiparser-node/config/default.json')).json())());
            parserConfig = await fetchConfig;
            config !== null && config !== void 0 ? config : (config = CodeMirror6.getMwConfig(parserConfig));
            config.linkSuggest = (s) => [[`${s} (article)`], [`${s} (user)`]];
            config.paramSuggest = () => [['param1'], ['param2']];
            Object.assign(cm, { config });
        }
        await cm.setLanguage(lang, config);
        if (search.get('lint') !== '0' && !(lang in linters)) {
            linters[lang] = await cm.getLinter();
            if (isMediaWiki && typeof wikiparse === 'object') {
                wikiparse.setConfig(parserConfig);
            }
            if (linters[lang]) {
                cm.lint(linters[lang]);
            }
        }
    };
    const updateSearch = (key, value) => {
        const url = new URL(location.href);
        if (value) {
            url.searchParams.set(key, String(value));
        }
        else {
            url.searchParams.delete(key);
        }
        history.replaceState(null, '', url.toString());
    };
    const prefer = function () {
        cm.prefer({ [this.id]: this.checked });
        updateSearch(this.id, Number(this.checked));
    };
    const indentChange = () => {
        const { value } = indent;
        cm.setIndent(value || '\t');
        updateSearch('indent', value);
    };
    for (const input of languages) {
        input.addEventListener('change', () => {
            void init(input.id);
            history.replaceState(null, '', `#${input.id.charAt(0).toUpperCase()}${input.id.slice(1)}`);
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
    ]);
    addEventListener('hashchange', () => {
        const target = hashMap.get(location.hash.slice(1).toLowerCase()), element = languages.find(({ id }) => id === target);
        if (element) {
            element.checked = true;
            element.dispatchEvent(new Event('change'));
        }
    });
    dispatchEvent(new Event('hashchange'));
    for (const extension of extensions) {
        extension.addEventListener('change', prefer);
    }
    cm.prefer(extensions.filter(({ checked }) => checked).map(({ id }) => id));
    indent.addEventListener('change', indentChange);
    indentChange();
    Object.assign(globalThis, { cm });
})();
