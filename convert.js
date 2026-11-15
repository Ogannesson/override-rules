/*!
powerfullz 的 Substore 订阅转换脚本
https://github.com/powerfullz/override-rules

支持的传入参数：
- grouptype: 地区代理组类型（0=select 手动选择, 1=url-test 自动测速, 2=load-balance 负载均衡，默认 1）
  - 向后兼容：若未传 grouptype 但传了 loadbalance，则 loadbalance=true 映射为 grouptype=2，loadbalance=false 映射为 grouptype=1
- landing: 自动检测带 `dialer-proxy` 字段的节点，无需用户传参
- ipv6: 启用 IPv6 支持（默认 false）
- tun: 启用 TUN 模式（默认 false）
- full: 输出完整配置（适合纯内核启动，默认 false）
- keepalive: 启用 tcp-keep-alive（默认 false）
- fakeip: DNS 使用 FakeIP 模式（默认 true；传 false 时为 RedirHost）
- quic: 允许 QUIC 流量（UDP 443，默认 false）
- threshold: 地区节点数量小于该值时不显示分组（默认 2）
- regex: 使用正则过滤模式（include-all + filter）写入各地区代理组，而非直接枚举节点名称（默认 false）
- adblock: 去广告规则（0=关闭，1=adrules.top，2=217heidai，3=AWAvenue，默认 3）
- asn: 为 AI服务 追加 Anthropic 全部 ASN 的 IP-ASN 规则（默认 false；开启后需能下载 ASN 数据库，否则整份配置加载失败）

WARP 出口分组：自动识别名称含 warp/cloudflare 的节点并单独成组（挂到各服务分组候选），无需传参。
Global家宽分组：名称以 🌐 开头的多地区家宽节点同样单独成组，不进地区分组。
Antigravity 分组：Antigravity 及共用 Cloud Code 接口的 Gemini CLI / Code Assist、Vertex AI 流量，以及 Gemini 网页版和 App 的对话单独分流，默认跟随 AI服务。
Twitter静态资源分组：twimg 等 Twitter 静态域名单独分流，默认跟随静态资源。
地区归类：节点名称以国旗开头时只按国旗归入对应地区，未知国旗不归入任何地区（仅枚举模式；regex 模式仍按正则匹配）。

源码位于 `src/`，入口为 `src/main.ts`。
*/
"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // src/utils/primitives.ts
  function parseBool(value, defaultValue = false) {
    if (typeof value === "undefined") return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return value.toLowerCase() === "true" || value === "1";
    }
    return false;
  }
  function parseNumber(value, defaultValue = 0) {
    if (value === null || typeof value === "undefined") {
      return defaultValue;
    }
    const num = parseInt(String(value), 10);
    return Number.isNaN(num) ? defaultValue : num;
  }
  function buildList(...elements) {
    return elements.flat().filter(Boolean);
  }
  function isNotNull(value) {
    return value !== null;
  }
  var init_primitives = __esm({
    "src/utils/primitives.ts"() {
      "use strict";
    }
  });

  // src/args/schema.ts
  var ARG_DEFAULTS;
  var init_schema = __esm({
    "src/args/schema.ts"() {
      "use strict";
      ARG_DEFAULTS = {
        /** 地区代理组类型：0=select，1=url-test，2=load-balance。 */
        groupType: 1,
        /** 地区节点数量小于该值时不生成地区组。 */
        countryThreshold: 2,
        /** 启用 IPv6 支持。 */
        ipv6Enabled: false,
        /** 输出完整内核配置。 */
        fullConfig: false,
        /** 启用 TCP keep-alive。 */
        keepAliveEnabled: false,
        /** 使用 fake-ip 增强模式。 */
        fakeIPEnabled: true,
        /** 允许 QUIC（UDP 443）流量。 */
        quicEnabled: false,
        /** 使用正则过滤模式。 */
        regexFilter: false,
        /** 启用 TUN 模式。 */
        tunEnabled: false,
        /** 去广告规则来源：0=关闭，1=adrules.top，2=217heidai，3=AWAvenue。 */
        adblockSource: 3,
        /** 为 AI服务 追加 Anthropic 的 IP-ASN 规则（依赖 ASN 数据库）。 */
        asnEnabled: false
      };
    }
  });

  // src/args/parse.ts
  function parseGroupType(args) {
    const raw = parseNumber(args.grouptype, Number.NaN);
    if (raw === 0 || raw === 1 || raw === 2) return raw;
    if (typeof args.loadbalance !== "undefined") {
      return parseBool(args.loadbalance) ? 2 : 1;
    }
    return ARG_DEFAULTS.groupType;
  }
  function parseAdblockSource(args) {
    const raw = parseNumber(args.adblock, ARG_DEFAULTS.adblockSource);
    return raw === 0 || raw === 1 || raw === 2 || raw === 3 ? raw : ARG_DEFAULTS.adblockSource;
  }
  function buildFeatureFlags(args) {
    return {
      groupType: parseGroupType(args),
      ipv6Enabled: parseBool(args.ipv6, ARG_DEFAULTS.ipv6Enabled),
      fullConfig: parseBool(args.full, ARG_DEFAULTS.fullConfig),
      keepAliveEnabled: parseBool(args.keepalive, ARG_DEFAULTS.keepAliveEnabled),
      fakeIPEnabled: parseBool(args.fakeip, ARG_DEFAULTS.fakeIPEnabled),
      quicEnabled: parseBool(args.quic, ARG_DEFAULTS.quicEnabled),
      regexFilter: parseBool(args.regex, ARG_DEFAULTS.regexFilter),
      tunEnabled: parseBool(args.tun, ARG_DEFAULTS.tunEnabled),
      countryThreshold: parseNumber(args.threshold, ARG_DEFAULTS.countryThreshold),
      adblockSource: parseAdblockSource(args),
      asnEnabled: parseBool(args.asn, ARG_DEFAULTS.asnEnabled)
    };
  }
  var init_parse = __esm({
    "src/args/parse.ts"() {
      "use strict";
      init_primitives();
      init_schema();
    }
  });

  // src/catalog/endpoints.ts
  var CDN_URL, SPEEDTEST_URL;
  var init_endpoints = __esm({
    "src/catalog/endpoints.ts"() {
      "use strict";
      CDN_URL = "https://cdn.jsdelivr.net";
      SPEEDTEST_URL = "https://cp.cloudflare.com";
    }
  });

  // src/catalog/countries.ts
  var QURE, COUNTRY_KEYS, countriesMeta, FLAG_REGEX, countryFlagMap, countryRegexMap, countryExcludeRegexMap;
  var init_countries = __esm({
    "src/catalog/countries.ts"() {
      "use strict";
      init_endpoints();
      QURE = `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color`;
      COUNTRY_KEYS = {
        hongKong: "香港",
        taiwan: "台湾",
        unitedStates: "美国"
      };
      countriesMeta = {
        [COUNTRY_KEYS.hongKong]: {
          weight: 10,
          pattern: "香港|港|\\b(?:HK|hk)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Hong Kong|HongKong|hongkong|HONG KONG|HONGKONG|深港|HKG|九龙|Kowloon|新界|沙田|荃湾|葵涌|🇭🇰",
          icon: `${QURE}/Hong_Kong.png`
        },
        澳门: {
          pattern: "澳门|\\b(?:MO|mo)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Macau|🇲🇴",
          icon: `${QURE}/Macao.png`
        },
        [COUNTRY_KEYS.taiwan]: {
          weight: 20,
          pattern: "台|新北|彰化|\\b(?:TW|tw)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TAIWAN|TWN|TPE|ROC|🇹🇼|🇼🇸",
          icon: `${QURE}/Taiwan.png`
        },
        新加坡: {
          weight: 30,
          pattern: "新加坡|坡|狮城|\\b(?:SG|sg)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SINGAPORE|SIN|🇸🇬",
          icon: `${QURE}/Singapore.png`
        },
        日本: {
          weight: 40,
          pattern: "日本|川日|东京|大阪|泉日|埼玉|沪日|深日|\\b(?:JP|jp)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JAPAN|JPN|NRT|HND|KIX|TYO|OSA|关西|Kansai|KANSAI|🇯🇵",
          icon: `${QURE}/Japan.png`
        },
        韩国: {
          weight: 45,
          pattern: "韩国|韩|韓|春川|Chuncheon|首尔|\\b(?:KR|kr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOREA|KOR|ICN|🇰🇷",
          icon: `${QURE}/Korea.png`,
          excludePattern: "北韩|North Korea|NORTH KOREA"
        },
        [COUNTRY_KEYS.unitedStates]: {
          weight: 50,
          pattern: "美国|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|亚特兰大|迈阿密|华盛顿|\\b(?:US|us)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|UNITED STATES|USA|America|AMERICA|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC|🇺🇸",
          icon: `${QURE}/United_States.png`,
          excludePattern: "美属|亚美尼亚|圣多美|普林西比"
        },
        加拿大: {
          weight: 55,
          pattern: "加拿大|渥太华|温哥华|卡尔加里|蒙特利尔|Montreal|\\b(?:CA|ca)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Canada|CANADA|CAN|YVR|YYZ|YUL|🇨🇦",
          icon: `${QURE}/Canada.png`
        },
        英国: {
          weight: 60,
          pattern: "英国|伦敦|曼彻斯特|Manchester|\\b(?:UK|uk)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Britain|United Kingdom|UNITED KINGDOM|England|GBR|LHR|MAN|🇬🇧",
          icon: `${QURE}/United_Kingdom.png`
        },
        澳大利亚: {
          pattern: "澳洲|澳大利亚|\\b(?:AU|au)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Australia|🇦🇺",
          icon: `${QURE}/Australia.png`
        },
        德国: {
          weight: 70,
          pattern: "德国|德|柏林|法兰克福|慕尼黑|Munich|\\b(?:DE|de)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Germany|GERMANY|DEU|MUC|🇩🇪",
          icon: `${QURE}/Germany.png`,
          excludePattern: "瓜德罗普"
        },
        法国: {
          weight: 80,
          pattern: "法国|法|巴黎|马赛|Marseille|\\b(?:FR|fr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|France|FRANCE|FRA|CDG|MRS|🇫🇷",
          icon: `${QURE}/France.png`,
          excludePattern: "法属|布基纳法索|法罗"
        },
        俄罗斯: {
          pattern: "俄罗斯|俄|\\b(?:RU|ru)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Russia|🇷🇺",
          icon: `${QURE}/Russia.png`,
          excludePattern: "埃塞俄比亚|白俄罗斯"
        },
        泰国: {
          pattern: "泰国|泰|\\b(?:TH|th)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Thailand|🇹🇭",
          icon: `${QURE}/Thailand.png`,
          excludePattern: "巴泰"
        },
        印度: {
          pattern: "印度|\\b(?:IN|in)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|India|🇮🇳",
          icon: `${QURE}/India.png`,
          excludePattern: "印度洋"
        },
        马来西亚: {
          pattern: "马来西亚|马来|\\b(?:MY|my)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Malaysia|🇲🇾",
          icon: `${QURE}/Malaysia.png`
        },
        阿根廷: {
          pattern: "阿根廷|布宜诺斯艾利斯|\\b(?:AR|ar)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Argentina|EZE|🇦🇷",
          icon: `${QURE}/Argentina.png`
        },
        芬兰: {
          pattern: "芬兰|赫尔辛基|\\b(?:FI|fi)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Finland|HEL|🇫🇮",
          icon: `${QURE}/Finland.png`
        },
        埃及: {
          pattern: "埃及|开罗|\\b(?:EG|eg)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Egypt|CAI|🇪🇬",
          icon: `${QURE}/Egypt.png`
        },
        菲律宾: {
          pattern: "菲律宾|马尼拉|\\b(?:PH|ph)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Philippines|MNL|🇵🇭",
          icon: `${QURE}/Philippines.png`
        },
        土耳其: {
          pattern: "土耳其|伊斯坦布尔|\\b(?:TR|tr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Turkey|Türkiye|IST|🇹🇷",
          icon: `${QURE}/Turkey.png`
        },
        乌克兰: {
          pattern: "乌克兰|基辅|\\b(?:UA|ua)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Ukraine|KBP|🇺🇦",
          icon: `${QURE}/Ukraine.png`
        },
        朝鲜: {
          weight: 90,
          pattern: "朝鲜|北韩|平壤|\\b(?:KP|kp)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|North Korea|NORTH KOREA|DPRK|PRK|FNJ|🇰🇵",
          icon: `${CDN_URL}/gh/Semporia/Hand-Painted-icon@master/Rounded_Rectangle/North_Korea.png`
        }
      };
      FLAG_REGEX = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
      countryFlagMap = Object.fromEntries(
        Object.entries(countriesMeta).flatMap(
          ([country, meta]) => (meta.pattern.match(FLAG_REGEX) ?? []).map((flag) => [flag, country])
        )
      );
      countryRegexMap = Object.fromEntries(
        Object.entries(countriesMeta).map(([country, meta]) => [country, new RegExp(meta.pattern)])
      );
      countryExcludeRegexMap = Object.fromEntries(
        Object.entries(countriesMeta).flatMap(
          ([country, meta]) => meta.excludePattern ? [[country, new RegExp(meta.excludePattern)]] : []
        )
      );
    }
  });

  // src/utils/regex.ts
  function createCaseInsensitiveNodeMatcher(source) {
    return {
      source,
      regex: new RegExp(source, "i"),
      pattern: `(?i)${source}`
    };
  }
  function escapeRegExp(value) {
    return value.replace(REGEXP_SPECIAL_CHARS, "\\$&");
  }
  function buildNodeExcludeFilter(nodes) {
    const names = [...new Set(nodes.map((node) => node.name).filter(Boolean))];
    if (names.length === 0) return void 0;
    return `^(?:${names.map(escapeRegExp).join("|")})$`;
  }
  function combineExcludeFilters(base, extra) {
    if (!base) return extra;
    if (!extra) return base;
    return `${base}|${extra}`;
  }
  var REGEXP_SPECIAL_CHARS;
  var init_regex = __esm({
    "src/utils/regex.ts"() {
      "use strict";
      REGEXP_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;
    }
  });

  // src/catalog/exit-floating.ts
  var WARP_NODE_MATCHER, GLOBAL_RESIDENTIAL_NODE_MATCHER;
  var init_exit_floating = __esm({
    "src/catalog/exit-floating.ts"() {
      "use strict";
      init_regex();
      WARP_NODE_MATCHER = createCaseInsensitiveNodeMatcher(String.raw`warp|cloudflare`);
      GLOBAL_RESIDENTIAL_NODE_MATCHER = createCaseInsensitiveNodeMatcher(String.raw`^🌐`);
    }
  });

  // src/catalog/group-names.ts
  function countryGroupName(country) {
    return `${country}${NODE_SUFFIX}`;
  }
  var NODE_SUFFIX, PROXY_GROUPS;
  var init_group_names = __esm({
    "src/catalog/group-names.ts"() {
      "use strict";
      NODE_SUFFIX = "节点";
      PROXY_GROUPS = {
        SELECT: "选择代理",
        MANUAL: "手动选择",
        AUTO: "自动选择",
        FALLBACK: "故障转移",
        LANDING: "落地节点",
        LOW_COST: "低倍率节点",
        WARP: "WARP节点",
        GLOBAL_RESIDENTIAL: "Global家宽",
        FRONT_PROXY: "前置代理",
        STATIC_RESOURCES: "静态资源",
        GAME_DOWNLOAD: "游戏下载",
        AI_SERVICE: "AI服务",
        ANTIGRAVITY: "Antigravity",
        CRYPTO: "加密货币",
        FINANCE: "金融服务",
        APPLE: "苹果服务",
        GOOGLE: "谷歌服务",
        MICROSOFT: "微软服务",
        BILIBILI: "哔哩哔哩",
        BAHAMUT: "巴哈姆特",
        XBOX: "Xbox",
        TAILSCALE: "Tailscale",
        GITHUB: "Github",
        YOUTUBE: "Youtube",
        NETFLIX: "Netflix",
        TIKTOK: "TikTok",
        SPOTIFY: "Spotify",
        EHENTAI: "E-Hentai",
        TELEGRAM: "Telegram",
        TRUTH_SOCIAL: "Truth Social",
        TWITTER: "Twitter",
        TWITTER_STATIC: "Twitter静态资源",
        TWITCH: "Twitch",
        WEIBO: "新浪微博",
        PIKPAK: "PikPak网盘",
        SSH: "SSH",
        SOGOU_INPUT: "搜狗输入法",
        AD_BLOCK: "广告拦截",
        GLOBAL: "GLOBAL",
        FINAL: "Final"
      };
    }
  });

  // src/catalog/low-cost.ts
  var LOW_COST_NODE_MATCHER;
  var init_low_cost = __esm({
    "src/catalog/low-cost.ts"() {
      "use strict";
      init_regex();
      LOW_COST_NODE_MATCHER = createCaseInsensitiveNodeMatcher(
        String.raw`0\.[0-5]|低倍率|省流|实验性`
      );
    }
  });

  // src/analysis/active-countries.ts
  function getActiveCountryNames(countryNodes, minCount) {
    return Object.entries(countryNodes).filter(([, nodes]) => nodes.length >= minCount).sort(([a], [b]) => {
      const wa = countriesMeta[a].weight ?? Infinity;
      const wb = countriesMeta[b].weight ?? Infinity;
      return wa - wb;
    }).map(([country]) => country);
  }
  var init_active_countries = __esm({
    "src/analysis/active-countries.ts"() {
      "use strict";
      init_countries();
    }
  });

  // src/analysis/classify.ts
  function splitByLanding(nodes) {
    const landingNodes = [];
    const nonLandingNodes = [];
    for (const node of nodes) {
      if (!node.name) continue;
      if (node["dialer-proxy"] === PROXY_GROUPS.FRONT_PROXY) {
        landingNodes.push(node);
      } else {
        nonLandingNodes.push(node);
      }
    }
    return { landingNodes, nonLandingNodes };
  }
  function matchCountry(name) {
    const flag = LEADING_FLAG_REGEX.exec(name)?.[0];
    if (flag) return countryFlagMap[flag];
    for (const [country, regex] of Object.entries(countryRegexMap)) {
      if (!regex.test(name)) continue;
      if (countryExcludeRegexMap[country]?.test(name)) continue;
      return country;
    }
    return void 0;
  }
  function collectCountries(nodes) {
    const countryNodes = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      const country = matchCountry(node.name || "");
      if (!country) continue;
      const bucket = countryNodes.get(country);
      if (bucket) {
        bucket.push(node);
      } else {
        countryNodes.set(country, [node]);
      }
    }
    return Object.fromEntries(countryNodes);
  }
  function collectLowCost(nodes) {
    return nodes.filter((node) => LOW_COST_NODE_MATCHER.regex.test(node.name || ""));
  }
  function collectWarp(nodes) {
    return nodes.filter((node) => WARP_NODE_MATCHER.regex.test(node.name || ""));
  }
  function collectGlobalResidential(nodes) {
    return nodes.filter((node) => {
      const name = node.name || "";
      return GLOBAL_RESIDENTIAL_NODE_MATCHER.regex.test(name) && !WARP_NODE_MATCHER.regex.test(name);
    });
  }
  function isTailscaleNode(node) {
    return node.type === "tailscale";
  }
  function collectTailscale(nodes) {
    return nodes.filter(isTailscaleNode);
  }
  function excludeTailscale(nodes) {
    return nodes.filter((node) => !isTailscaleNode(node));
  }
  function analyzeNodes(nodes, threshold) {
    const { landingNodes, nonLandingNodes } = splitByLanding(nodes);
    const landing = landingNodes.length > 0;
    const tailscaleNodes = collectTailscale(nodes);
    const scopedNodes = excludeTailscale(landing ? nonLandingNodes : nodes);
    const warpNodes = collectWarp(scopedNodes);
    const globalResidentialNodes = collectGlobalResidential(scopedNodes);
    const exitFloatingNodes = /* @__PURE__ */ new Set([...warpNodes, ...globalResidentialNodes]);
    const classifiableNodes = scopedNodes.filter((node) => !exitFloatingNodes.has(node));
    const countryNodes = collectCountries(classifiableNodes);
    const countryNames = getActiveCountryNames(countryNodes, threshold);
    const lowCostNodes = collectLowCost(classifiableNodes);
    const regionLayout = countryNames.length >= MIN_REGION_GROUPS ? { mode: "grouped", groupedCountries: countryNames, flattenedNodes: [] } : {
      mode: "flattened",
      groupedCountries: [],
      flattenedNodes: excludeTailscale(nonLandingNodes)
    };
    return {
      allNodes: nodes,
      manualNames: excludeTailscale(nodes).map((node) => node.name),
      landingNodes,
      nonLandingNodes,
      landing,
      countryNodes,
      countryNames,
      regionLayout,
      lowCostNodes,
      warpNodes,
      globalResidentialNodes,
      tailscaleNodes,
      hasTailscale: tailscaleNodes.length > 0
    };
  }
  var MIN_REGION_GROUPS, LEADING_FLAG_REGEX;
  var init_classify = __esm({
    "src/analysis/classify.ts"() {
      "use strict";
      init_countries();
      init_exit_floating();
      init_group_names();
      init_low_cost();
      init_active_countries();
      MIN_REGION_GROUPS = 2;
      LEADING_FLAG_REGEX = /^[\u{1F1E6}-\u{1F1FF}]{2}/u;
    }
  });

  // src/builders/selectors.ts
  function buildFlattenedNodeSource(nodes, landingNodes, tailscaleNodes, regexFilter) {
    if (nodes.length === 0) return null;
    if (regexFilter) {
      const excludeFilter = buildNodeExcludeFilter([...landingNodes, ...tailscaleNodes]);
      return {
        "include-all": true,
        ...excludeFilter ? { "exclude-filter": excludeFilter } : {}
      };
    }
    const proxies = nodes.map((node) => node.name).filter(Boolean);
    return proxies.length > 0 ? { proxies } : null;
  }
  function buildFlattenedBaseLists({
    landing,
    hasLowCost,
    hasWarp,
    hasGlobalResidential,
    flattenedNodeSource,
    flattenedNodes
  }) {
    const defaultSelector = buildList(
      landing && PROXY_GROUPS.LANDING,
      flattenedNodeSource,
      hasLowCost && PROXY_GROUPS.LOW_COST,
      hasWarp && PROXY_GROUPS.WARP,
      hasGlobalResidential && PROXY_GROUPS.GLOBAL_RESIDENTIAL,
      "DIRECT"
    );
    const defaultFallback = buildList(
      landing && PROXY_GROUPS.LANDING,
      flattenedNodeSource
    );
    const frontProxySelector = buildList(
      "DIRECT",
      flattenedNodes.map((node) => node.name).filter(Boolean)
    );
    return {
      defaultSelector,
      defaultProxies: buildList(
        landing && PROXY_GROUPS.LANDING,
        flattenedNodeSource,
        hasLowCost && PROXY_GROUPS.LOW_COST,
        hasWarp && PROXY_GROUPS.WARP,
        hasGlobalResidential && PROXY_GROUPS.GLOBAL_RESIDENTIAL,
        "DIRECT"
      ),
      defaultProxiesDirect: buildList(
        "DIRECT",
        landing && PROXY_GROUPS.LANDING,
        flattenedNodeSource,
        hasLowCost && PROXY_GROUPS.LOW_COST,
        hasWarp && PROXY_GROUPS.WARP,
        hasGlobalResidential && PROXY_GROUPS.GLOBAL_RESIDENTIAL
      ),
      defaultFallback,
      frontProxySelector
    };
  }
  function buildGroupedBaseLists({
    landing,
    regexFilter,
    hasLowCost,
    hasWarp,
    hasGlobalResidential,
    suffixedCountryNames,
    tailscaleNodes,
    nonLandingNodes
  }) {
    const tailscaleNames = new Set(tailscaleNodes.map((node) => node.name).filter(Boolean));
    const frontProxyNames = nonLandingNodes.filter((node) => !tailscaleNames.has(node.name)).map((node) => node.name).filter(Boolean);
    const defaultFallback = buildList(
      landing && PROXY_GROUPS.LANDING,
      suffixedCountryNames
    );
    return {
      defaultSelector: buildList(
        PROXY_GROUPS.AUTO,
        PROXY_GROUPS.FALLBACK,
        landing && PROXY_GROUPS.LANDING,
        suffixedCountryNames,
        hasLowCost && PROXY_GROUPS.LOW_COST,
        hasWarp && PROXY_GROUPS.WARP,
        hasGlobalResidential && PROXY_GROUPS.GLOBAL_RESIDENTIAL,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
      ),
      defaultProxies: buildList(
        PROXY_GROUPS.SELECT,
        landing && PROXY_GROUPS.LANDING,
        suffixedCountryNames,
        hasLowCost && PROXY_GROUPS.LOW_COST,
        hasWarp && PROXY_GROUPS.WARP,
        hasGlobalResidential && PROXY_GROUPS.GLOBAL_RESIDENTIAL,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
      ),
      defaultProxiesDirect: buildList(
        "DIRECT",
        landing && PROXY_GROUPS.LANDING,
        suffixedCountryNames,
        hasLowCost && PROXY_GROUPS.LOW_COST,
        hasWarp && PROXY_GROUPS.WARP,
        hasGlobalResidential && PROXY_GROUPS.GLOBAL_RESIDENTIAL,
        PROXY_GROUPS.SELECT,
        PROXY_GROUPS.MANUAL
      ),
      defaultFallback,
      frontProxySelector: buildList(
        suffixedCountryNames,
        "DIRECT",
        !regexFilter && frontProxyNames
      )
    };
  }
  function buildBaseLists({
    landing,
    landingNodes,
    lowCostNodes,
    warpNodes,
    globalResidentialNodes,
    nonLandingNodes,
    tailscaleNodes,
    regexFilter,
    regions
  }) {
    const suffixedCountryNames = regions.groupedCountries.map(countryGroupName);
    const hasLowCost = lowCostNodes.length > 0 || regexFilter;
    const hasWarp = warpNodes.length > 0 || regexFilter;
    const hasGlobalResidential = globalResidentialNodes.length > 0 || regexFilter;
    if (regions.mode === "flattened") {
      return buildFlattenedBaseLists({
        landing,
        hasLowCost,
        hasWarp,
        hasGlobalResidential,
        flattenedNodeSource: buildFlattenedNodeSource(
          regions.flattenedNodes,
          landingNodes,
          tailscaleNodes,
          regexFilter
        ),
        flattenedNodes: regions.flattenedNodes
      });
    }
    return buildGroupedBaseLists({
      landing,
      regexFilter,
      hasLowCost,
      hasWarp,
      hasGlobalResidential,
      suffixedCountryNames,
      tailscaleNodes,
      nonLandingNodes
    });
  }
  var init_selectors = __esm({
    "src/builders/selectors.ts"() {
      "use strict";
      init_group_names();
      init_primitives();
      init_regex();
    }
  });

  // src/catalog/icons.ts
  var QURE2, SELF, STASH, MINI, ICONS;
  var init_icons = __esm({
    "src/catalog/icons.ts"() {
      "use strict";
      init_endpoints();
      QURE2 = `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color`;
      SELF = `${CDN_URL}/gh/powerfullz/override-rules@master/icons`;
      STASH = `${CDN_URL}/gh/shindgewongxj/WHATSINStash@master/icon`;
      MINI = `${CDN_URL}/gh/Orz-3/mini@master/Color`;
      ICONS = {
        select: `${QURE2}/Proxy.png`,
        manual: `${STASH}/select.png`,
        frontProxy: `${QURE2}/Area.png`,
        landing: `${QURE2}/Airport.png`,
        staticResources: `${QURE2}/Cloudflare.png`,
        gameDownload: `${QURE2}/Game.png`,
        aiService: `${QURE2}/ChatGPT.png`,
        antigravity: `${QURE2}/Google_Search.png`,
        crypto: `${QURE2}/Cryptocurrency_1.png`,
        finance: `${SELF}/Nasdaq.png`,
        apple: `${QURE2}/Apple_2.png`,
        google: `${MINI}/Google.png`,
        microsoft: `${SELF}/Microsoft_Copilot.png`,
        xbox: `${QURE2}/Xbox.png`,
        github: `${QURE2}/GitHub.png`,
        bilibili: `${QURE2}/bilibili.png`,
        bahamut: `${QURE2}/Bahamut.png`,
        youtube: `${QURE2}/YouTube.png`,
        twitch: `${QURE2}/Twitch.png`,
        netflix: `${QURE2}/Netflix.png`,
        tiktok: `${QURE2}/TikTok.png`,
        spotify: `${QURE2}/Spotify.png`,
        telegram: `${SELF}/Telegram.png`,
        twitter: `${QURE2}/Twitter.png`,
        twitterStatic: `${QURE2}/X.png`,
        weibo: `${QURE2}/Weibo.png`,
        truthSocial: `${SELF}/Truth_Social.png`,
        ehentai: `${SELF}/Ehentai.png`,
        pikpak: `${SELF}/PikPak.png`,
        sogouInput: `${SELF}/Sougou.png`,
        ssh: `${QURE2}/Server.png`,
        tailscale: `${SELF}/Tailscale.png`,
        adBlock: `${QURE2}/AdBlack.png`,
        final: `${QURE2}/Final.png`,
        auto: `${QURE2}/Auto.png`,
        fallback: `${QURE2}/Available_1.png`,
        lowCost: `${QURE2}/Lab.png`,
        warp: `${QURE2}/Cloudflare.png`,
        globalResidential: `${QURE2}/World_Map.png`,
        global: `${QURE2}/Global.png`
      };
    }
  });

  // src/catalog/rule-sets.ts
  function ruleSet(key, target) {
    return `RULE-SET,${key},${target}`;
  }
  var ruleSets, adblockAlternatives;
  var init_rule_sets = __esm({
    "src/catalog/rule-sets.ts"() {
      "use strict";
      init_endpoints();
      ruleSets = {
        ADBlock: {
          type: "http",
          behavior: "domain",
          format: "yaml",
          interval: 86400,
          url: `${CDN_URL}/gh/217heidai/adblockfilters@main/rules/adblockmihomolite.yaml`,
          path: "./ruleset/ADBlock.yaml"
        },
        SogouInput: {
          type: "http",
          behavior: "classical",
          format: "text",
          interval: 86400,
          url: "https://ruleset.skk.moe/Clash/non_ip/sogouinput.txt",
          path: "./ruleset/SogouInput.txt"
        },
        StaticResources: {
          type: "http",
          behavior: "domain",
          format: "text",
          interval: 86400,
          url: "https://ruleset.skk.moe/Clash/domainset/cdn.txt",
          path: "./ruleset/StaticResources.txt"
        },
        CDNResources: {
          type: "http",
          behavior: "classical",
          format: "text",
          interval: 86400,
          url: "https://ruleset.skk.moe/Clash/non_ip/cdn.txt",
          path: "./ruleset/CDNResources.txt"
        },
        TikTok: {
          type: "http",
          behavior: "classical",
          format: "text",
          interval: 86400,
          url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/TikTok.list`,
          path: "./ruleset/TikTok.list"
        },
        EHentai: {
          type: "http",
          behavior: "classical",
          format: "text",
          interval: 86400,
          url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/EHentai.list`,
          path: "./ruleset/EHentai.list"
        },
        SteamFix: {
          type: "http",
          behavior: "classical",
          format: "text",
          interval: 86400,
          url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/SteamFix.list`,
          path: "./ruleset/SteamFix.list"
        },
        AdditionalFilter: {
          type: "http",
          behavior: "classical",
          format: "text",
          interval: 86400,
          url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/AdditionalFilter.list`,
          path: "./ruleset/AdditionalFilter.list"
        },
        AdditionalCDNResources: {
          type: "http",
          behavior: "classical",
          format: "text",
          interval: 86400,
          url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/AdditionalCDNResources.list`,
          path: "./ruleset/AdditionalCDNResources.list"
        },
        Weibo: {
          type: "http",
          behavior: "classical",
          format: "text",
          interval: 86400,
          url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/Weibo.list`,
          path: "./ruleset/Weibo.list"
        },
        GFWList: {
          type: "http",
          behavior: "domain",
          format: "yaml",
          interval: 86400,
          url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/gfw.txt",
          path: "./ruleset/GFWList.yaml"
        }
      };
      adblockAlternatives = {
        1: {
          type: "http",
          behavior: "domain",
          format: "mrs",
          interval: 86400,
          url: "https://adrules.top/adrules-mihomo.mrs",
          path: "./ruleset/ADBlock.mrs"
        },
        3: {
          type: "http",
          behavior: "domain",
          format: "mrs",
          interval: 86400,
          url: `${CDN_URL}/gh/TG-Twilight/AWAvenue-Ads-Rule@main/Filters/AWAvenue-Ads-Rule-Clash.mrs`,
          path: "./ruleset/ADBlock.mrs"
        }
      };
    }
  });

  // src/catalog/dns.ts
  var FAKE_IP_FILTER, DEFAULT_NAMESERVERS, DEFAULT_FALLBACK_DNS;
  var init_dns = __esm({
    "src/catalog/dns.ts"() {
      "use strict";
      FAKE_IP_FILTER = [
        "geosite:connectivity-check",
        "Mijia Cloud",
        "dig.io.mi.com",
        "localhost.ptlogin2.qq.com",
        "*.icloud.com",
        "*.stun.*.*",
        "*.stun.*.*.*",
        "*.lan",
        "*.localdomain",
        "*.example",
        "*.invalid",
        "*.localhost",
        "*.test",
        "*.local",
        "*.home.arpa",
        "time.*.com",
        "time.*.gov",
        "time.*.edu.cn",
        "time.*.apple.com",
        "time1.*.com",
        "time2.*.com",
        "time3.*.com",
        "time4.*.com",
        "time5.*.com",
        "time6.*.com",
        "time7.*.com",
        "ntp.*.com",
        "ntp1.*.com",
        "ntp2.*.com",
        "ntp3.*.com",
        "ntp4.*.com",
        "ntp5.*.com",
        "ntp6.*.com",
        "ntp7.*.com",
        "*.time.edu.cn",
        "*.ntp.org.cn",
        "+.pool.ntp.org",
        "time1.cloud.tencent.com",
        "stun.*.*",
        "stun.*.*.*",
        "swscan.apple.com",
        "mesu.apple.com",
        "music.163.com",
        "*.music.163.com",
        "*.126.net",
        "musicapi.taihe.com",
        "music.taihe.com",
        "songsearch.kugou.com",
        "trackercdn.kugou.com",
        "*.kuwo.cn",
        "api-jooxtt.sanook.com",
        "api.joox.com",
        "y.qq.com",
        "*.y.qq.com",
        "streamoc.music.tc.qq.com",
        "mobileoc.music.tc.qq.com",
        "isure.stream.qqmusic.qq.com",
        "dl.stream.qqmusic.qq.com",
        "aqqmusic.tc.qq.com",
        "amobile.music.tc.qq.com",
        "localhost.ptlogin2.qq.com",
        "*.msftconnecttest.com",
        "*.msftncsi.com",
        "*.xiami.com",
        "*.music.migu.cn",
        "music.migu.cn",
        "+.wotgame.cn",
        "+.wggames.cn",
        "+.wowsgame.cn",
        "+.wargaming.net",
        "*.*.*.srv.nintendo.net",
        "*.*.stun.playstation.net",
        "xbox.*.*.microsoft.com",
        "*.*.xboxlive.com",
        "*.ipv6.microsoft.com",
        "teredo.*.*.*",
        "teredo.*.*",
        "speedtest.cros.wr.pvp.net",
        "+.jjvip8.com",
        "www.douyu.com",
        "activityapi.huya.com",
        "activityapi.huya.com.w.cdngslb.com",
        "www.bilibili.com",
        "api.bilibili.com",
        "a.w.bilicdn1.com",
        "+.apt-agent.com"
      ];
      DEFAULT_NAMESERVERS = [
        "system",
        "223.5.5.5",
        "119.29.29.29",
        "180.184.1.1"
      ];
      DEFAULT_FALLBACK_DNS = [
        "quic://dns0.eu",
        "https://dns.cloudflare.com/dns-query",
        "https://dns.sb/dns-query",
        "tcp://208.67.222.222",
        "tcp://8.26.56.2"
      ];
    }
  });

  // src/builders/dns.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function toStringList(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : void 0;
  }
  function mergeStringList(current, upstream) {
    const upstreamList = toStringList(upstream);
    if (!current && !upstreamList) return void 0;
    return [.../* @__PURE__ */ new Set([...current ?? [], ...upstreamList ?? []])];
  }
  function mergePolicyMap(current, upstream) {
    if (!isRecord(upstream)) return current;
    const inherited = {};
    for (const [domain, value] of Object.entries(upstream)) {
      if (typeof value === "string") {
        inherited[domain] = value;
      } else if (toStringList(value)) {
        inherited[domain] = value;
      }
    }
    return { ...current ?? {}, ...inherited };
  }
  function inheritPolicyFields(generated, upstream) {
    const inherited = {};
    for (const field of POLICY_FIELDS) {
      const merged = mergePolicyMap(generated[field], upstream[field]);
      if (merged !== void 0) inherited[field] = merged;
    }
    return inherited;
  }
  function inheritScalarFields(generated, upstream) {
    const inherited = {};
    for (const field of SCALAR_FIELDS) {
      const current = generated[field];
      const value = upstream[field];
      if (current === void 0 && typeof value === "string" && value.length > 0) {
        inherited[field] = value;
      }
    }
    return inherited;
  }
  function inheritListFields(generated, upstream) {
    const inherited = {};
    for (const field of LIST_FIELDS) {
      const merged = mergeStringList(generated[field], upstream[field]);
      if (merged !== void 0) inherited[field] = merged;
    }
    return inherited;
  }
  function inheritDnsFields(generated, upstream) {
    if (!isRecord(upstream)) return generated;
    return {
      ...generated,
      ...inheritPolicyFields(generated, upstream),
      ...inheritListFields(generated, upstream),
      ...inheritScalarFields(generated, upstream)
    };
  }
  function createBaseDnsConfig(mode, ipv6Enabled) {
    return {
      enable: true,
      ipv6: ipv6Enabled,
      "prefer-h3": true,
      "enhanced-mode": mode,
      nameserver: [...DEFAULT_NAMESERVERS],
      fallback: [...DEFAULT_FALLBACK_DNS],
      ...mode === "fake-ip" && { "fake-ip-filter": [...FAKE_IP_FILTER] }
    };
  }
  function buildDns({ fakeIPEnabled, ipv6Enabled, upstreamDns }) {
    const generated = createBaseDnsConfig(fakeIPEnabled ? "fake-ip" : "redir-host", ipv6Enabled);
    return inheritDnsFields(generated, upstreamDns);
  }
  var POLICY_FIELDS, LIST_FIELDS, SCALAR_FIELDS;
  var init_dns2 = __esm({
    "src/builders/dns.ts"() {
      "use strict";
      init_dns();
      POLICY_FIELDS = ["nameserver-policy", "proxy-server-nameserver-policy"];
      LIST_FIELDS = ["proxy-server-nameserver", "fake-ip-filter"];
      SCALAR_FIELDS = ["listen"];
    }
  });

  // src/builders/full-config.ts
  function buildFullConfig(flags) {
    return {
      "mixed-port": 7890,
      "redir-port": 7892,
      "tproxy-port": 7893,
      "routing-mark": 7894,
      "allow-lan": true,
      "bind-address": "*",
      ipv6: flags.ipv6Enabled,
      mode: "rule",
      "unified-delay": true,
      "tcp-concurrent": true,
      "find-process-mode": "off",
      "log-level": "info",
      "geodata-loader": "standard",
      "external-controller": ":9999",
      "disable-keep-alive": !flags.keepAliveEnabled,
      profile: { "store-selected": true }
    };
  }
  var init_full_config = __esm({
    "src/builders/full-config.ts"() {
      "use strict";
    }
  });

  // src/builders/geox.ts
  var geoxUrl;
  var init_geox = __esm({
    "src/builders/geox.ts"() {
      "use strict";
      init_endpoints();
      geoxUrl = {
        geoip: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/geoip.dat`,
        geosite: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/geosite.dat`,
        mmdb: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/country.mmdb`,
        asn: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb`
      };
    }
  });

  // src/builders/rules.ts
  function buildRules({
    quicEnabled,
    hasTailscale,
    adblockSource,
    asnEnabled
  }) {
    return [
      !quicEnabled ? `AND,((DST-PORT,443),(NETWORK,UDP)),REJECT` : null,
      // Antigravity 必须先于 category-ai-!cn，否则会被 AI 规则先匹配走。
      // 前三条是模型调用：Gemini、Claude、GPT-OSS 都经 Google 的 Cloud Code 接口转发；
      // cloudcode-pa 与 Gemini CLI、Gemini Code Assist 共用，它们一并跟着走
      `DOMAIN,cloudcode-pa.googleapis.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN,daily-cloudcode-pa.googleapis.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN,daily-cloudcode-pa.sandbox.googleapis.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      // aicode 与 Android Studio 的 Gemini 共用
      `DOMAIN-SUFFIX,aicode.googleapis.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN-SUFFIX,antigravity.google,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN-SUFFIX,antigravity.google.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN-SUFFIX,antigravity-unleash.goog,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN,antigravity-pa.googleapis.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN,antigravity.googleapis.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN-REGEX,^antigravity-([a-z]+-)?auto-updater-[0-9]+\\.[a-z0-9-]+\\.run\\.app$,${PROXY_GROUPS.ANTIGRAVITY}`,
      // 企业版与 Vertex AI（含区域、.rep、.mtls 端点）；全部 Vertex 流量都进本组
      `DOMAIN-REGEX,^businessaicode(\\.(us|eu)\\.rep|\\.mtls)?\\.googleapis\\.com$,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN-REGEX,^([a-z0-9-]+-)?aiplatform(\\.(us|eu)\\.rep|\\.mtls)?\\.googleapis\\.com$,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN-REGEX,^((us|eu)-)?discoveryengine(\\.mtls)?\\.googleapis\\.com$,${PROXY_GROUPS.ANTIGRAVITY}`,
      // Gemini 网页版与 App 的对话主机。只收 Gemini 专用主机：上传、生成的图片视频、语音、
      // 登录、人机验证用的是和其他 Google 产品共用的主机，拆不出来，仍走谷歌服务、静态资源组
      `DOMAIN-SUFFIX,gemini.google.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN-SUFFIX,gemini.google,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN-SUFFIX,bard.google.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN-SUFFIX,gemini.gstatic.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN-REGEX,^geminiweb-pa\\.(clients6?\\.google|googleapis)\\.com$,${PROXY_GROUPS.ANTIGRAVITY}`,
      // App 的对话后端；webchannel- 是 iOS 用的，geosite 未收录
      `DOMAIN-REGEX,^(webchannel-)?robinfrontend-pa(\\.mtls)?\\.googleapis\\.com$,${PROXY_GROUPS.ANTIGRAVITY}`,
      // App 查询能否使用 Gemini 的接口，与 Google App 的后台同步共用，随对话同出口
      `DOMAIN-SUFFIX,proactivebackend-pa.googleapis.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      `DOMAIN-SUFFIX,geller-pa.googleapis.com,${PROXY_GROUPS.ANTIGRAVITY}`,
      // AI 服务紧随其后，先于其它所有分流，避免其它规则出问题时 AI 连接受牵连；
      // AI 域名的 QUIC 仍被拒绝、退回 TCP
      `GEOSITE,category-ai-!cn,${PROXY_GROUPS.AI_SERVICE}`,
      // geosite 未收录的 AI 相关域名：Claude Desktop，
      // 以及 Claude/ChatGPT 登录风控用的人机验证（需与 AI 同出口）
      `DOMAIN-SUFFIX,claude.app,${PROXY_GROUPS.AI_SERVICE}`,
      `DOMAIN-SUFFIX,hcaptcha.com,${PROXY_GROUPS.AI_SERVICE}`,
      `DOMAIN,challenges.cloudflare.com,${PROXY_GROUPS.AI_SERVICE}`,
      `DOMAIN-SUFFIX,arkoselabs.com,${PROXY_GROUPS.AI_SERVICE}`,
      // ARIN 直接分配给 Anthropic 的地址块（AP-2440），兜底没有域名的连接
      `IP-CIDR,160.79.104.0/21,${PROXY_GROUPS.AI_SERVICE},no-resolve`,
      `IP-CIDR,153.61.0.0/16,${PROXY_GROUPS.AI_SERVICE},no-resolve`,
      `IP-CIDR6,2607:6bc0::/32,${PROXY_GROUPS.AI_SERVICE},no-resolve`,
      // 153.61.0.0/16 的子段由 Google Cloud / AWS 代为宣告，按 ASN 匹配不到，故与 CIDR 并存；
      // ASN 数据库下载不到时整份配置加载失败，因此默认不加
      ...asnEnabled ? ANTHROPIC_ASNS.map((asn) => `IP-ASN,${asn},${PROXY_GROUPS.AI_SERVICE},no-resolve`) : [],
      hasTailscale ? `IP-CIDR,100.64.0.0/10,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
      hasTailscale ? `IP-CIDR,fd7a:115c:a1e0::/48,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
      hasTailscale ? `DOMAIN-SUFFIX,ts.net,${PROXY_GROUPS.TAILSCALE}` : null,
      `GEOIP,private,DIRECT,no-resolve`,
      // 排在局域网直连之后：内网主机的 SSH 直连，只有外部主机的 SSH 进 SSH 组
      `DST-PORT,22,${PROXY_GROUPS.SSH}`,
      adblockSource > 0 ? ruleSet("ADBlock", PROXY_GROUPS.AD_BLOCK) : null,
      adblockSource > 0 ? ruleSet("AdditionalFilter", PROXY_GROUPS.AD_BLOCK) : null,
      ruleSet("SogouInput", PROXY_GROUPS.SOGOU_INPUT),
      `DOMAIN-SUFFIX,truthsocial.com,${PROXY_GROUPS.TRUTH_SOCIAL}`,
      ruleSet("SteamFix", "DIRECT"),
      `GEOSITE,category-game-platforms-download,${PROXY_GROUPS.GAME_DOWNLOAD}`,
      // 这些 Twitter 静态域名也在 StaticResources 规则集里，必须在它之前截住
      `DOMAIN-SUFFIX,twimg.com,${PROXY_GROUPS.TWITTER_STATIC}`,
      `DOMAIN,assets.pscp.tv,${PROXY_GROUPS.TWITTER_STATIC}`,
      `DOMAIN,cdn.cms-twdigitalassets.com,${PROXY_GROUPS.TWITTER_STATIC}`,
      ruleSet("StaticResources", PROXY_GROUPS.STATIC_RESOURCES),
      ruleSet("CDNResources", PROXY_GROUPS.STATIC_RESOURCES),
      ruleSet("AdditionalCDNResources", PROXY_GROUPS.STATIC_RESOURCES),
      `GEOSITE,category-cryptocurrency,${PROXY_GROUPS.CRYPTO}`,
      `GEOSITE,category-finance,${PROXY_GROUPS.FINANCE}`,
      `GEOSITE,bilibili,${PROXY_GROUPS.BILIBILI}`,
      `GEOSITE,youtube,${PROXY_GROUPS.YOUTUBE}`,
      `GEOSITE,telegram,${PROXY_GROUPS.TELEGRAM}`,
      `GEOIP,telegram,${PROXY_GROUPS.TELEGRAM},no-resolve`,
      `GEOSITE,xbox,${PROXY_GROUPS.XBOX}`,
      `GEOSITE,github,${PROXY_GROUPS.GITHUB}`,
      `GEOSITE,netflix,${PROXY_GROUPS.NETFLIX}`,
      `GEOSITE,twitch,${PROXY_GROUPS.TWITCH}`,
      `GEOIP,netflix,${PROXY_GROUPS.NETFLIX},no-resolve`,
      `GEOSITE,spotify,${PROXY_GROUPS.SPOTIFY}`,
      `GEOSITE,bahamut,${PROXY_GROUPS.BAHAMUT}`,
      `GEOSITE,pikpak,${PROXY_GROUPS.PIKPAK}`,
      `GEOSITE,twitter,${PROXY_GROUPS.TWITTER}`,
      ruleSet("Weibo", PROXY_GROUPS.WEIBO),
      ruleSet("EHentai", PROXY_GROUPS.EHENTAI),
      ruleSet("TikTok", PROXY_GROUPS.TIKTOK),
      `GEOSITE,google-play@cn,DIRECT`,
      `GEOSITE,microsoft@cn,DIRECT`,
      `GEOSITE,apple,${PROXY_GROUPS.APPLE}`,
      `GEOSITE,microsoft,${PROXY_GROUPS.MICROSOFT}`,
      `GEOSITE,google,${PROXY_GROUPS.GOOGLE}`,
      ruleSet("GFWList", PROXY_GROUPS.SELECT),
      `GEOIP,cn,DIRECT`,
      `MATCH,${PROXY_GROUPS.FINAL}`
    ].filter(isNotNull);
  }
  var ANTHROPIC_ASNS;
  var init_rules = __esm({
    "src/builders/rules.ts"() {
      "use strict";
      init_group_names();
      init_rule_sets();
      init_primitives();
      ANTHROPIC_ASNS = [399358, 60808, 4167, 400243, 401551];
    }
  });

  // src/builders/sniffer.ts
  var snifferConfig;
  var init_sniffer = __esm({
    "src/builders/sniffer.ts"() {
      "use strict";
      snifferConfig = {
        sniff: {
          TLS: {
            ports: [443, 8443]
          },
          HTTP: {
            ports: [80, 8080, 8880]
          },
          QUIC: {
            ports: [443, 8443]
          }
        },
        "override-destination": false,
        enable: true,
        "force-dns-mapping": false,
        "skip-domain": ["Mijia Cloud", "dlg.io.mi.com", "+.push.apple.com"]
      };
    }
  });

  // src/builders/tun.ts
  function buildTunConfig(tunEnabled, hasTailscale) {
    return {
      enable: tunEnabled,
      // 旧版 mihomo 内核不认识 mips 等新取值，会让整份配置加载失败，固定用 gvisor
      stack: "gvisor",
      device: "mihomo",
      "route-exclude-address": [
        !hasTailscale ? "100.64.0.0/10" : null,
        !hasTailscale ? "fd7a:115c:a1e0::/48" : null,
        "192.168.0.0/16"
      ].filter(isNotNull),
      "dns-hijack": ["any:53"],
      mtu: 9e3
    };
  }
  var init_tun = __esm({
    "src/builders/tun.ts"() {
      "use strict";
      init_primitives();
    }
  });

  // src/builders/config.ts
  function appendGlobalGroup(groups) {
    const global = {
      name: PROXY_GROUPS.GLOBAL,
      icon: ICONS.global,
      "include-all": true,
      type: "select",
      proxies: groups.map((group) => String(group.name))
    };
    return [...groups, global];
  }
  function assembleConfig(config, { flags, nodes, proxyGroups }) {
    const { ADBlock, AdditionalFilter, ...baseRuleSets } = ruleSets;
    let adblockProvider;
    if (flags.adblockSource === 2) {
      adblockProvider = ADBlock;
    } else if (flags.adblockSource !== 0) {
      adblockProvider = adblockAlternatives[flags.adblockSource];
    }
    return {
      proxies: config.proxies,
      ...config.hosts !== void 0 && { hosts: config.hosts },
      ...flags.fullConfig && buildFullConfig(flags),
      "proxy-groups": appendGlobalGroup(proxyGroups),
      "rule-providers": {
        ...baseRuleSets,
        ...adblockProvider && { ADBlock: adblockProvider, AdditionalFilter }
      },
      rules: buildRules({
        quicEnabled: flags.quicEnabled,
        hasTailscale: nodes.hasTailscale,
        adblockSource: flags.adblockSource,
        asnEnabled: flags.asnEnabled
      }),
      sniffer: snifferConfig,
      dns: buildDns({
        fakeIPEnabled: flags.fakeIPEnabled,
        ipv6Enabled: flags.ipv6Enabled,
        upstreamDns: config.dns
      }),
      tun: buildTunConfig(flags.tunEnabled, nodes.hasTailscale),
      "geodata-mode": true,
      "geox-url": geoxUrl
    };
  }
  var init_config = __esm({
    "src/builders/config.ts"() {
      "use strict";
      init_group_names();
      init_icons();
      init_rule_sets();
      init_dns2();
      init_full_config();
      init_geox();
      init_rules();
      init_sniffer();
      init_tun();
    }
  });

  // src/catalog/service-groups.ts
  function prioritizeLowCost(ctx) {
    const { defaultProxies } = ctx.lists;
    if (!defaultProxies.includes(PROXY_GROUPS.LOW_COST)) return defaultProxies;
    return [
      PROXY_GROUPS.LOW_COST,
      ...defaultProxies.filter((candidate) => candidate !== PROXY_GROUPS.LOW_COST)
    ];
  }
  var serviceGroups;
  var init_service_groups = __esm({
    "src/catalog/service-groups.ts"() {
      "use strict";
      init_countries();
      init_group_names();
      init_icons();
      serviceGroups = [
        {
          name: PROXY_GROUPS.STATIC_RESOURCES,
          icon: ICONS.staticResources,
          includeAll: true,
          proxies: prioritizeLowCost
        },
        {
          name: PROXY_GROUPS.GAME_DOWNLOAD,
          icon: ICONS.gameDownload,
          includeAll: true,
          // 游戏下载默认直连，其次走静态资源的出口
          proxies: (ctx) => [
            "DIRECT",
            PROXY_GROUPS.STATIC_RESOURCES,
            ...ctx.lists.defaultProxies.filter((candidate) => candidate !== "DIRECT")
          ]
        },
        {
          name: PROXY_GROUPS.AI_SERVICE,
          icon: ICONS.aiService,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.ANTIGRAVITY,
          icon: ICONS.antigravity,
          includeAll: true,
          // 默认跟随 AI服务 出口，需要时可单独切换
          proxies: (ctx) => [PROXY_GROUPS.AI_SERVICE, ...ctx.lists.defaultProxies]
        },
        {
          name: PROXY_GROUPS.CRYPTO,
          icon: ICONS.crypto,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.FINANCE,
          icon: ICONS.finance,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.APPLE,
          icon: ICONS.apple,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.GOOGLE,
          icon: ICONS.google,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.MICROSOFT,
          icon: ICONS.microsoft,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.XBOX,
          icon: ICONS.xbox,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.GITHUB,
          icon: ICONS.github,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.BILIBILI,
          icon: ICONS.bilibili,
          includeAll: true,
          proxies: (ctx) => {
            const groupedCountries = ctx.nodes.regionLayout.groupedCountries;
            return groupedCountries.includes(COUNTRY_KEYS.taiwan) && groupedCountries.includes(COUNTRY_KEYS.hongKong) ? [
              "DIRECT",
              countryGroupName(COUNTRY_KEYS.taiwan),
              countryGroupName(COUNTRY_KEYS.hongKong)
            ] : ctx.lists.defaultProxiesDirect;
          }
        },
        {
          name: PROXY_GROUPS.BAHAMUT,
          icon: ICONS.bahamut,
          includeAll: true,
          proxies: (ctx) => ctx.nodes.regionLayout.groupedCountries.includes(COUNTRY_KEYS.taiwan) ? [
            countryGroupName(COUNTRY_KEYS.taiwan),
            PROXY_GROUPS.SELECT,
            PROXY_GROUPS.MANUAL,
            "DIRECT"
          ] : ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.YOUTUBE,
          icon: ICONS.youtube,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.TWITCH,
          icon: ICONS.twitch,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.NETFLIX,
          icon: ICONS.netflix,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.TIKTOK,
          icon: ICONS.tiktok,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.SPOTIFY,
          icon: ICONS.spotify,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.TELEGRAM,
          icon: ICONS.telegram,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.TWITTER,
          icon: ICONS.twitter,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.TWITTER_STATIC,
          icon: ICONS.twitterStatic,
          includeAll: true,
          // 默认跟随静态资源出口，需要时可切到 Twitter 或其它出口
          proxies: (ctx) => [
            PROXY_GROUPS.STATIC_RESOURCES,
            PROXY_GROUPS.TWITTER,
            ...ctx.lists.defaultProxies
          ]
        },
        {
          name: PROXY_GROUPS.WEIBO,
          icon: ICONS.weibo,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxiesDirect
        },
        {
          name: PROXY_GROUPS.TRUTH_SOCIAL,
          icon: ICONS.truthSocial,
          includeAll: true,
          proxies: (ctx) => ctx.nodes.regionLayout.groupedCountries.includes(COUNTRY_KEYS.unitedStates) ? [
            countryGroupName(COUNTRY_KEYS.unitedStates),
            PROXY_GROUPS.SELECT,
            PROXY_GROUPS.MANUAL
          ] : ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.EHENTAI,
          icon: ICONS.ehentai,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.PIKPAK,
          icon: ICONS.pikpak,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        },
        {
          name: PROXY_GROUPS.SOGOU_INPUT,
          icon: ICONS.sogouInput,
          proxies: () => ["DIRECT", "REJECT"]
        },
        {
          name: PROXY_GROUPS.SSH,
          icon: ICONS.ssh,
          includeAll: true,
          proxies: (ctx) => ctx.lists.defaultProxies
        }
      ];
    }
  });

  // src/domain/proxy-group.ts
  function ensureNonEmptyNodeSource(nodeSource) {
    if (nodeSource["include-all"]) return nodeSource;
    if (nodeSource.proxies && nodeSource.proxies.length > 0) return nodeSource;
    return { ...nodeSource, proxies: ["DIRECT"] };
  }
  function normalizeNodeSource(candidates, includeAll = false) {
    const proxies = [];
    const nodeSource = {};
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        proxies.push(candidate);
        continue;
      }
      if (candidate.proxies) proxies.push(...candidate.proxies);
      if (candidate["include-all"]) nodeSource["include-all"] = true;
      if (candidate.filter !== void 0) nodeSource.filter = candidate.filter;
      if (candidate["exclude-filter"] !== void 0) {
        nodeSource["exclude-filter"] = candidate["exclude-filter"];
      }
    }
    if (includeAll) nodeSource["include-all"] = true;
    if (proxies.length > 0) nodeSource.proxies = proxies;
    return ensureNonEmptyNodeSource(nodeSource);
  }
  function buildGroupByType({
    name,
    icon,
    groupType,
    nodeSource
  }) {
    const source = normalizeNodeSource([nodeSource]);
    switch (groupType) {
      case 0:
        return { name, icon, type: "select", ...source };
      case 1:
        return {
          name,
          icon,
          type: "url-test",
          url: SPEEDTEST_URL,
          interval: 60,
          tolerance: 20,
          ...source
        };
      case 2:
        return {
          name,
          icon,
          type: "load-balance",
          strategy: "sticky-sessions",
          url: SPEEDTEST_URL,
          interval: 60,
          tolerance: 20,
          ...source
        };
    }
  }
  function selectGroup(name, icon, candidates, includeAll = false, hidden = false) {
    return {
      name,
      icon,
      type: "select",
      ...hidden ? { hidden: true } : {},
      ...normalizeNodeSource(candidates, includeAll)
    };
  }
  function selectAllGroup(name, icon, excludeFilter) {
    return {
      name,
      icon,
      type: "select",
      "include-all": true,
      ...excludeFilter ? { "exclude-filter": excludeFilter } : {}
    };
  }
  function urlTestGroup(name, icon, candidates) {
    return {
      name,
      icon,
      type: "url-test",
      url: SPEEDTEST_URL,
      ...normalizeNodeSource(candidates),
      interval: 60,
      tolerance: 20
    };
  }
  function fallbackGroup(name, icon, candidates) {
    return {
      name,
      icon,
      type: "fallback",
      url: SPEEDTEST_URL,
      ...normalizeNodeSource(candidates),
      interval: 60,
      tolerance: 20
    };
  }
  var init_proxy_group = __esm({
    "src/domain/proxy-group.ts"() {
      "use strict";
      init_endpoints();
    }
  });

  // src/builders/proxy-groups.ts
  function buildFrontGroups(ctx) {
    let manualGroup = null;
    if (ctx.nodes.regionLayout.mode === "grouped") {
      manualGroup = ctx.flags.regexFilter ? selectAllGroup(
        PROXY_GROUPS.MANUAL,
        ICONS.manual,
        buildNodeExcludeFilter(ctx.nodes.tailscaleNodes)
      ) : selectGroup(PROXY_GROUPS.MANUAL, ICONS.manual, ctx.nodes.manualNames);
    }
    return [
      selectGroup(PROXY_GROUPS.SELECT, ICONS.select, ctx.lists.defaultSelector),
      manualGroup,
      ctx.nodes.landing ? selectGroup(PROXY_GROUPS.FRONT_PROXY, ICONS.frontProxy, ctx.lists.frontProxySelector) : null,
      ctx.nodes.landing ? selectGroup(
        PROXY_GROUPS.LANDING,
        ICONS.landing,
        ctx.nodes.landingNodes.map((node) => node.name)
      ) : null
    ];
  }
  function buildServiceGroups(ctx) {
    const grouped = ctx.nodes.regionLayout.mode === "grouped";
    return serviceGroups.map(
      (def) => selectGroup(def.name, def.icon, def.proxies(ctx), def.includeAll && grouped)
    );
  }
  function buildTailGroups(ctx) {
    return [
      ctx.nodes.hasTailscale ? selectGroup(
        PROXY_GROUPS.TAILSCALE,
        ICONS.tailscale,
        ctx.nodes.tailscaleNodes.map((node) => node.name),
        false,
        true
      ) : null,
      selectGroup(
        PROXY_GROUPS.AD_BLOCK,
        ICONS.adBlock,
        ["REJECT", "REJECT-DROP", "DIRECT"],
        false,
        ctx.flags.adblockSource === 0
      ),
      selectGroup(PROXY_GROUPS.FINAL, ICONS.final, [PROXY_GROUPS.SELECT, "DIRECT"]),
      urlTestGroup(PROXY_GROUPS.AUTO, ICONS.auto, ctx.lists.defaultFallback),
      fallbackGroup(PROXY_GROUPS.FALLBACK, ICONS.fallback, ctx.lists.defaultFallback)
    ];
  }
  function exitFloatingGroup(name, icon, nodes, regexSource, regexFilter) {
    if (nodes.length === 0 && !regexFilter) return null;
    return selectGroup(name, icon, regexFilter ? [regexSource] : nodes.map((node) => node.name));
  }
  function buildRegionGroups(ctx) {
    const { flags, nodes } = ctx;
    const hasLowCost = nodes.lowCostNodes.length > 0 || flags.regexFilter;
    const tailscaleExcludeFilter = buildNodeExcludeFilter(nodes.tailscaleNodes);
    const lowCostGroup = hasLowCost ? buildGroupByType({
      name: PROXY_GROUPS.LOW_COST,
      icon: ICONS.lowCost,
      groupType: flags.groupType,
      nodeSource: !flags.regexFilter ? { proxies: nodes.lowCostNodes.map((node) => node.name) } : {
        "include-all": true,
        filter: LOW_COST_NODE_MATCHER.pattern,
        "exclude-filter": combineExcludeFilters(
          EXIT_FLOATING_EXCLUDE,
          tailscaleExcludeFilter
        )
      }
    }) : null;
    const warpGroup = exitFloatingGroup(
      PROXY_GROUPS.WARP,
      ICONS.warp,
      nodes.warpNodes,
      { "include-all": true, filter: WARP_NODE_MATCHER.pattern },
      flags.regexFilter
    );
    const globalResidentialGroup = exitFloatingGroup(
      PROXY_GROUPS.GLOBAL_RESIDENTIAL,
      ICONS.globalResidential,
      nodes.globalResidentialNodes,
      {
        "include-all": true,
        filter: GLOBAL_RESIDENTIAL_NODE_MATCHER.pattern,
        "exclude-filter": WARP_EXCLUDE
      },
      flags.regexFilter
    );
    const countryGroups = nodes.regionLayout.groupedCountries.map((country) => {
      const meta = countriesMeta[country];
      const excludeFilter = combineExcludeFilters(
        combineExcludeFilters(meta.excludePattern, EXIT_FLOATING_EXCLUDE),
        tailscaleExcludeFilter
      );
      const nodeSource = flags.regexFilter ? {
        "include-all": true,
        filter: meta.pattern,
        ...excludeFilter ? { "exclude-filter": excludeFilter } : {}
      } : { proxies: nodes.countryNodes[country].map((node) => node.name) };
      return buildGroupByType({
        name: countryGroupName(country),
        icon: meta.icon,
        groupType: flags.groupType,
        nodeSource
      });
    });
    return [lowCostGroup, warpGroup, globalResidentialGroup, ...countryGroups];
  }
  function buildProxyGroups(ctx) {
    const groups = [
      ...buildFrontGroups(ctx),
      ...buildServiceGroups(ctx),
      ...buildTailGroups(ctx),
      ...buildRegionGroups(ctx)
    ];
    return groups.filter(isNotNull);
  }
  var WARP_EXCLUDE, EXIT_FLOATING_EXCLUDE;
  var init_proxy_groups = __esm({
    "src/builders/proxy-groups.ts"() {
      "use strict";
      init_countries();
      init_exit_floating();
      init_group_names();
      init_icons();
      init_low_cost();
      init_service_groups();
      init_proxy_group();
      init_primitives();
      init_regex();
      WARP_EXCLUDE = `(?i:${WARP_NODE_MATCHER.source})`;
      EXIT_FLOATING_EXCLUDE = `(?i:${WARP_NODE_MATCHER.source}|${GLOBAL_RESIDENTIAL_NODE_MATCHER.source})`;
    }
  });

  // src/main.ts
  var require_main = __commonJS({
    "src/main.ts"() {
      init_parse();
      init_classify();
      init_selectors();
      init_config();
      init_proxy_groups();
      function readRawArgs() {
        try {
          return $arguments;
        } catch {
          return {};
        }
      }
      function main(config) {
        if (!config.proxies || !Array.isArray(config.proxies)) {
          throw new Error("[powerfullz 的覆写脚本] 错误：Clash 配置中缺少有效的 proxies 字段");
        }
        const flags = buildFeatureFlags(readRawArgs());
        const nodes = analyzeNodes(config.proxies, flags.countryThreshold);
        const lists = buildBaseLists({
          landing: nodes.landing,
          landingNodes: nodes.landingNodes,
          lowCostNodes: nodes.lowCostNodes,
          warpNodes: nodes.warpNodes,
          globalResidentialNodes: nodes.globalResidentialNodes,
          nonLandingNodes: nodes.nonLandingNodes,
          tailscaleNodes: nodes.tailscaleNodes,
          regexFilter: flags.regexFilter,
          regions: nodes.regionLayout
        });
        const proxyGroups = buildProxyGroups({ flags, nodes, lists });
        return assembleConfig(config, { flags, nodes, proxyGroups });
      }
      globalThis.main = main;
    }
  });
  require_main();
})();
