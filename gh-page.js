// src/gh-page.ts
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
  nord
} from "/codemirror-mediawiki/dist/main.min.js";
import abusefilterDialect from "/lezer-abusefilter/dist/dialect.test.js";

// src/suggest.test.ts
var linkSuggest = (s, _, ns) => {
  if (ns === 0) {
    return [[`${s} (article)`], [`${s} (user)`]];
  }
  const colon = s.indexOf(":");
  return [[colon === -1 ? s : `${s.slice(colon + 1)} (${s.slice(0, colon).toLowerCase()})`]];
};
var paramSuggest = (s) => Object.assign(
  s.includes(":") ? [] : [["param1"], ["param2", "another parameter"]],
  { description: "Example template" }
);

// src/gh-page.ts
registerCSS();
registerHTML();
registerJSON();
registerJavaScript();
registerLua();
registerMediaWiki("https://www.mediawiki.org/wiki/");
registerVue();
registerAbuseFilter();
registerTheme("nord", nord);
registerBidiIsolates();
if (location.pathname.startsWith("/codemirror-mediawiki")) {
  const textarea = document.querySelector("#wpTextbox"), languages = [...document.querySelectorAll('input[name="language"]')], extensions = [...document.querySelectorAll('input[type="checkbox"]')], indent = document.querySelector("#indent"), search = new URLSearchParams(location.search);
  if (search.has("rtl")) {
    textarea.dir = "rtl";
  }
  if (search.has("indent")) {
    indent.value = search.get("indent");
  }
  for (const extension of extensions) {
    extension.checked = search.has(extension.id);
  }
  const mediawikiOnly = ["escape", "refHover", "hover", "signatureHelp", "inlayHints", "openLinks"], cssOnly = ["colorPicker"], cssLangs = /* @__PURE__ */ new Set(["css", "vue", "html"]), cm = new CodeMirror6(textarea), linters = {};
  let config, mwConfig, fetchConfig;
  const init = async (lang) => {
    const isMediaWiki = lang === "mediawiki", display = isMediaWiki ? "" : "none", cssDisplay = isMediaWiki || cssLangs.has(lang) ? "" : "none", selector = ".fieldLayout";
    let parserConfig;
    for (const id of mediawikiOnly) {
      document.getElementById(id).closest(selector).style.display = display;
    }
    for (const id of cssOnly) {
      document.getElementById(id).closest(selector).style.display = cssDisplay;
    }
    if (isMediaWiki || lang === "html") {
      fetchConfig != null ? fetchConfig : fetchConfig = (async () => (await fetch("/wikiparser-node/config/default.json")).json())();
      parserConfig = await fetchConfig;
      if (!mwConfig) {
        mwConfig = {
          ...CodeMirror6.getMwConfig(parserConfig),
          linkSuggest,
          paramSuggest
        };
        Object.assign(cm, { mwConfig });
      }
      config = mwConfig;
    } else if (lang === "abusefilter") {
      config = abusefilterDialect;
    }
    await cm.setLanguage(lang, config);
    if (search.get("lint") !== "0" && !(lang in linters)) {
      linters[lang] = await cm.getLinter();
      if (isMediaWiki && typeof wikiparse === "object") {
        wikiparse.setConfig(Object.assign(await wikiparse.getConfig(), parserConfig));
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
    } else {
      url.searchParams.delete(key);
    }
    history.replaceState(null, "", url.toString());
  };
  const prefer = function() {
    const { id, checked } = this;
    if (id === "dark") {
      cm.setTheme(checked ? "nord" : "light");
    } else {
      cm.prefer({ [id]: checked });
    }
    updateSearch(id, Number(checked));
  };
  const indentChange = () => {
    const { value } = indent;
    cm.setIndent(value || "	");
    updateSearch("indent", value);
  };
  for (const input of languages) {
    input.addEventListener("change", () => {
      void init(input.id);
      history.replaceState(
        null,
        "",
        `#${input.id.charAt(0).toUpperCase()}${input.id.slice(1)}`
      );
    });
    if (input.checked) {
      void init(input.id);
    }
  }
  const hashMap = /* @__PURE__ */ new Map([
    ["wiki", "mediawiki"],
    ["wikitext", "mediawiki"],
    ["mediawiki", "mediawiki"],
    ["javascript", "javascript"],
    ["js", "javascript"],
    ["css", "css"],
    ["lua", "lua"],
    ["json", "json"],
    ["vue", "vue"],
    ["html", "html"],
    ["abusefilter", "abusefilter"]
  ]);
  addEventListener("hashchange", () => {
    const target = hashMap.get(location.hash.slice(1).toLowerCase()), element = languages.find(({ id }) => id === target);
    if (element) {
      element.checked = true;
      element.dispatchEvent(new Event("change"));
    }
  });
  dispatchEvent(new HashChangeEvent("hashchange"));
  for (const extension of extensions) {
    extension.addEventListener("change", prefer);
  }
  cm.prefer(extensions.filter(({ checked, id }) => checked && id !== "dark").map(({ id }) => id));
  cm.prefer({ bidiIsolates: true });
  if (extensions.some(({ checked, id }) => checked && id === "dark")) {
    cm.setTheme("nord");
  }
  indent.addEventListener("change", indentChange);
  indentChange();
  Object.assign(globalThis, { cm });
}
