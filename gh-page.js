// src/gh-page.ts
import {
  CodeMirror6,
  registerCSS,
  registerHTML,
  registerJSON,
  registerJSONC,
  registerJavaScript,
  registerLua,
  registerMediaWiki,
  registerVue,
  registerAbuseFilter,
  registerTheme,
  registerBidiIsolates,
  nord
} from "/codemirror-mediawiki/dist/main.min.js";

// ../lezer-abusefilter/test/src/dialect.ts
var dialect_default = {
  functions: [
    "lcase",
    "ucase",
    "length",
    "string",
    "int",
    "float",
    "bool",
    "norm",
    "ccnorm",
    "ccnorm_contains_any",
    "ccnorm_contains_all",
    "specialratio",
    "rmspecials",
    "rmdoubles",
    "rmwhitespace",
    "count",
    "rcount",
    "get_matches",
    "ip_in_range",
    "ip_in_ranges",
    "contains_any",
    "contains_all",
    "equals_to_any",
    "substr",
    "strlen",
    "strpos",
    "str_replace",
    "str_replace_regexp",
    "rescape",
    "set",
    "set_var",
    "sanitize"
  ],
  deprecated: [
    "accountname",
    "article_text",
    "article_prefixedtext",
    "article_namespace",
    "article_articleid",
    "article_restrictions_edit",
    "article_restrictions_move",
    "article_restrictions_create",
    "article_restrictions_upload",
    "article_recent_contributors",
    "article_first_contributor",
    "moved_from_text",
    "moved_from_prefixedtext",
    "moved_from_articleid",
    "moved_to_text",
    "moved_to_prefixedtext",
    "moved_to_articleid",
    "all_links",
    "board_articleid",
    "board_text",
    "board_prefixedtext"
  ],
  disabled: [
    "old_text",
    "old_html",
    "minor_edit"
  ],
  variables: [
    "timestamp",
    "account_name",
    "account_type",
    "action",
    "added_lines",
    "edit_delta",
    "edit_diff",
    "new_size",
    "old_size",
    "new_content_model",
    "old_content_model",
    "removed_lines",
    "summary",
    "page_id",
    "page_namespace",
    "page_title",
    "page_prefixedtitle",
    "page_age",
    "page_last_edit_age",
    "moved_from_id",
    "moved_from_namespace",
    "moved_from_title",
    "moved_from_prefixedtitle",
    "moved_from_age",
    "moved_from_last_edit_age",
    "moved_to_id",
    "moved_to_namespace",
    "moved_to_title",
    "moved_to_prefixedtitle",
    "moved_to_age",
    "moved_to_last_edit_age",
    "user_editcount",
    "user_age",
    "user_unnamed_ip",
    "user_name",
    "user_type",
    "user_groups",
    "user_rights",
    "user_blocked",
    "user_emailconfirm",
    "old_wikitext",
    "new_wikitext",
    "added_links",
    "removed_links",
    "old_links",
    "new_links",
    "new_pst",
    "edit_diff_pst",
    "added_lines_pst",
    "new_text",
    "new_html",
    "page_restrictions_edit",
    "page_restrictions_move",
    "page_restrictions_create",
    "page_restrictions_upload",
    "page_recent_contributors",
    "page_first_contributor",
    "moved_from_restrictions_edit",
    "moved_from_restrictions_move",
    "moved_from_restrictions_create",
    "moved_from_restrictions_upload",
    "moved_from_recent_contributors",
    "moved_from_first_contributor",
    "moved_to_restrictions_edit",
    "moved_to_restrictions_move",
    "moved_to_restrictions_create",
    "moved_to_restrictions_upload",
    "moved_to_recent_contributors",
    "moved_to_first_contributor",
    "file_sha1",
    "file_size",
    "file_mime",
    "file_mediatype",
    "file_width",
    "file_height",
    "file_bits_per_channel",
    "wiki_name",
    "wiki_language",
    "user_mobile",
    "translate_source_text",
    "translate_target_language",
    "board_id",
    "board_namespace",
    "board_title",
    "board_prefixedtitle",
    "tor_exit_node",
    "global_user_groups",
    "global_user_editcount",
    "global_account_groups",
    "global_account_editcount",
    "user_app",
    "oauth_consumer",
    "revertrisk_level",
    "ip_reputation_tunnel_operators",
    "ip_reputation_risk_types",
    "ip_reputation_client_proxies",
    "ip_reputation_client_behaviors",
    "ip_reputation_client_count",
    "ip_reputation_ipoid_known"
  ],
  keywords: [
    "in",
    "like",
    "true",
    "false",
    "null",
    "contains",
    "matches",
    "rlike",
    "irlike",
    "regex",
    "if",
    "then",
    "else",
    "end"
  ]
};

// src/suggest.test.ts
var linkSuggest = (s, _, ns = 0) => {
  if (ns === 0) {
    return [[`${s} (article)`, 0], ["Alice (user)", 0, `${s} (user)`], [`${s} (disambiguation)`, 0, [`Help:${s}`]]];
  }
  const colon = s.indexOf(":");
  return [[colon === -1 ? s : `${s.slice(colon + 1)} (${s.slice(0, colon).toLowerCase()})`, ns]];
};
var paramSuggest = (s) => Object.assign(
  s.includes(":") ? [] : [
    [["parameter without detail or info"], "", "", "Deprecated"],
    [
      ["parameter with detail and info", "argument with detail and info"],
      "2nd parameter",
      "a required parameter",
      "Required"
    ],
    [["parameter with info", "argument with info"], "", "a suggested parameter", "Suggested"],
    [["parameter with detail"], "4th parameter", "", "Optional"]
  ],
  { description: "Example template" }
);
var templateSignature = (templateName, parameterName) => {
  if (!templateName || !parameterName) {
    return void 0;
  }
  const parameter = parameterName.slice(0, -1).trim();
  let label = "";
  switch (parameter) {
    case "parameter with detail and info":
    case "argument with detail and info":
      label = "2nd parameter";
      break;
    case "parameter with detail":
      label = "4th parameter";
  }
  return label && `{{${templateName.trim()}|${parameter}=${label}}}`;
};

// src/gh-page.ts
registerCSS();
registerHTML();
registerJSON();
registerJSONC();
registerJavaScript();
registerLua();
registerMediaWiki("https://www.mediawiki.org/wiki/", true);
registerVue();
registerAbuseFilter();
registerTheme("dark", nord);
registerBidiIsolates();
if (location.pathname.startsWith("/codemirror-mediawiki")) {
  const textarea = document.querySelector("#wpTextbox"), languages = [...document.querySelectorAll('input[name="language"]')], extensions = [...document.querySelectorAll('input[type="checkbox"]')], indent = document.querySelector("#indent"), col = document.querySelector("#col"), search = new URLSearchParams(location.search);
  if (search.has("rtl")) {
    textarea.dir = "rtl";
  }
  if (search.has("indent")) {
    indent.value = search.get("indent");
  }
  if (search.has("col")) {
    col.value = String(Number(search.get("col")) || 0);
  }
  for (const extension of extensions) {
    extension.checked = search.has(extension.id);
  }
  const mediawikiOnly = ["escape", "refHover", "hover", "signatureHelp", "inlayHints", "openLinks"], nonMediawiki = ["indentGuide", "col"], htmlOnly = ["closeTags"], htmlLangs = /* @__PURE__ */ new Set(["mediawiki", "html", "vue"]), cssOnly = ["colorPicker"], cssLangs = /* @__PURE__ */ new Set([...htmlLangs, "css"]), abusefilterOnly = ["hover", "signatureHelp"], cm = new CodeMirror6(textarea), linters = {};
  let config, mwConfig, fetchConfig;
  const getLayoutStyle = (id) => document.getElementById(id).closest(".fieldLayout").style;
  const init = async (lang) => {
    const isMediaWiki = lang === "mediawiki", display = isMediaWiki ? "" : "none", revertDisplay = isMediaWiki ? "none" : "", cssDisplay = cssLangs.has(lang) ? "" : "none", htmlDisplay = htmlLangs.has(lang) ? "" : "none", abusefilterDisplay = isMediaWiki || lang === "abusefilter" ? "" : "none";
    let parserConfig;
    for (const id of mediawikiOnly) {
      getLayoutStyle(id).display = display;
    }
    for (const id of nonMediawiki) {
      getLayoutStyle(id).display = revertDisplay;
    }
    for (const id of cssOnly) {
      getLayoutStyle(id).display = cssDisplay;
    }
    for (const id of htmlOnly) {
      getLayoutStyle(id).display = htmlDisplay;
    }
    for (const id of abusefilterOnly) {
      getLayoutStyle(id).display = abusefilterDisplay;
    }
    if (isMediaWiki || lang === "html") {
      fetchConfig != null ? fetchConfig : fetchConfig = (async () => (await fetch("/wikiparser-node/config/default.json")).json())();
      parserConfig = await fetchConfig;
      if (!mwConfig) {
        mwConfig = {
          ...CodeMirror6.getMwConfig(parserConfig),
          linkSuggest,
          ...location.host === "localhost:8080" && { paramSuggest, templateSignature }
        };
        Object.assign(cm, { mwConfig });
      }
      config = mwConfig;
    } else if (lang === "abusefilter") {
      config = dialect_default;
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
      cm.setTheme(checked ? "dark" : "light");
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
  const colChange = () => {
    const column = Number(col.value);
    cm.setColumnGuide(column);
    updateSearch("col", column);
  };
  for (const input of languages) {
    input.addEventListener("change", () => {
      void init(input.id);
      history.replaceState(
        // eslint-disable-line no-restricted-globals
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
    ["jsonc", "jsonc"],
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
    cm.setTheme("dark");
  }
  indent.addEventListener("change", indentChange);
  indentChange();
  col.addEventListener("change", colChange);
  colChange();
  Object.assign(globalThis, { cm });
  if (location.host === "localhost:8080") {
    const queue = [], { body } = document;
    const isValid = (data, jsonc) => {
      const tag = jsonc ? "maplink" : "templatedata";
      queue.push(`<${tag}>
${data}
</${tag}>`);
    }, isInvalid = (data, _, jsonc) => {
      isValid(data, jsonc);
    }, it = (_, callback) => {
      callback();
    };
    Object.assign(globalThis, { isValid, isInvalid, it, describe: it });
    body.addEventListener("click", ({ target }) => {
      if (target === body && cm.lang === "mediawiki") {
        if (queue.length === 0) {
          console.error("No content in queue");
        } else {
          cm.setContent(queue.pop());
        }
      }
    });
  }
}
