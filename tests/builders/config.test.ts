import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFeatureFlags } from "../../src/args/parse";
import { analyzeNodes } from "../../src/analysis/classify";
import { buildBaseLists } from "../../src/builders/selectors";
import { assembleConfig } from "../../src/builders/config";
import { buildProxyGroups } from "../../src/builders/proxy-groups";
import { PROXY_GROUPS } from "../../src/catalog/group-names";
import { ruleSets } from "../../src/catalog/rule-sets";
import type { ClashConfig } from "../../src/types/clash";
import type { ProxyGroup } from "../../src/types/proxy";
import type { ScriptArgs } from "../../src/types/args";

function run(args: ScriptArgs, config: ClashConfig): ClashConfig {
    const flags = buildFeatureFlags(args);
    const proxies = config.proxies ?? [];
    const nodes = analyzeNodes(proxies, flags.countryThreshold);
    const lists = buildBaseLists({
        landing: nodes.landing,
        landingNodes: nodes.landingNodes,
        lowCostNodes: nodes.lowCostNodes,
        warpNodes: nodes.warpNodes,
        globalResidentialNodes: nodes.globalResidentialNodes,
        nonLandingNodes: nodes.nonLandingNodes,
        tailscaleNodes: nodes.tailscaleNodes,
        regexFilter: flags.regexFilter,
        regions: nodes.regionLayout,
    });
    const proxyGroups = buildProxyGroups({ flags, nodes, lists });
    return assembleConfig(config, { flags, nodes, proxyGroups });
}

function group(config: ClashConfig, name: string): ProxyGroup | undefined {
    return config["proxy-groups"]?.find((item) => item.name === name);
}

/** 带 `includeAll` 的服务组（除搜狗输入法外的全部服务组）。 */
const SERVICE_GROUP_NAMES = [
    PROXY_GROUPS.STATIC_RESOURCES,
    PROXY_GROUPS.GAME_DOWNLOAD,
    PROXY_GROUPS.AI_SERVICE,
    PROXY_GROUPS.ANTIGRAVITY,
    PROXY_GROUPS.CRYPTO,
    PROXY_GROUPS.FINANCE,
    PROXY_GROUPS.APPLE,
    PROXY_GROUPS.GOOGLE,
    PROXY_GROUPS.MICROSOFT,
    PROXY_GROUPS.XBOX,
    PROXY_GROUPS.GITHUB,
    PROXY_GROUPS.BILIBILI,
    PROXY_GROUPS.BAHAMUT,
    PROXY_GROUPS.YOUTUBE,
    PROXY_GROUPS.TWITCH,
    PROXY_GROUPS.NETFLIX,
    PROXY_GROUPS.TIKTOK,
    PROXY_GROUPS.SPOTIFY,
    PROXY_GROUPS.TELEGRAM,
    PROXY_GROUPS.TWITTER,
    PROXY_GROUPS.WEIBO,
    PROXY_GROUPS.TRUTH_SOCIAL,
    PROXY_GROUPS.EHENTAI,
    PROXY_GROUPS.PIKPAK,
    PROXY_GROUPS.SSH,
];

const CONFIG: ClashConfig = {
    proxies: [{ name: "香港01" }, { name: "香港02" }, { name: "美国01" }, { name: "美国02" }],
    hosts: { "example.com": ["1.2.3.4"] },
};

describe("assembleConfig", () => {
    it("追加 GLOBAL 组并以其前置组为候选", () => {
        const result = run({}, CONFIG);
        const groups = result["proxy-groups"] ?? [];
        const global = groups.at(-1);

        assert.equal(global?.name, PROXY_GROUPS.GLOBAL);
        assert.equal(global?.["include-all"], true);
        assert.deepEqual(
            global?.proxies,
            groups.slice(0, -1).map((item) => String(item.name))
        );
    });

    it("保留上游 proxies 与 hosts", () => {
        const result = run({}, CONFIG);
        assert.deepEqual(result.proxies, CONFIG.proxies);
        assert.deepEqual(result.hosts, CONFIG.hosts);
    });

    it("无上游 hosts 时不输出 hosts 字段", () => {
        const result = run({}, { proxies: [{ name: "香港01" }] });
        assert.ok(!("hosts" in result));
    });

    it("full=true 时追加完整内核参数", () => {
        const result = run({ full: "true" }, CONFIG);
        assert.equal(result["mixed-port"], 7890);
        assert.equal(result["external-controller"], ":9999");
        assert.equal(result.mode, "rule");
    });

    it("full 默认关闭", () => {
        const result = run({}, CONFIG);
        assert.equal(result["mixed-port"], undefined);
    });

    it("无地区组时三大主组直接使用节点（回归 #64）", () => {
        const result = run({}, { proxies: [{ name: "NodeA" }, { name: "NodeB" }] });

        // 展平后没有 AUTO / FALLBACK 的相互嵌套，也不再生成「手动选择」组。
        assert.deepEqual(group(result, PROXY_GROUPS.SELECT)?.proxies, ["NodeA", "NodeB", "DIRECT"]);
        assert.deepEqual(group(result, PROXY_GROUPS.AUTO)?.proxies, ["NodeA", "NodeB"]);
        assert.deepEqual(group(result, PROXY_GROUPS.FALLBACK)?.proxies, ["NodeA", "NodeB"]);
        assert.equal(group(result, PROXY_GROUPS.MANUAL), undefined);

        // 服务组也直接使用展平节点，不再引用「选择代理」。
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, ["NodeA", "NodeB", "DIRECT"]);
        // fork：金融服务与其他服务组一样默认走代理，不默认直连。
        assert.deepEqual(group(result, PROXY_GROUPS.FINANCE)?.proxies, [
            "NodeA",
            "NodeB",
            "DIRECT",
        ]);
        // 没有低倍率组时，静态资源组保持正常顺序。
        assert.deepEqual(group(result, PROXY_GROUPS.STATIC_RESOURCES)?.proxies, [
            "NodeA",
            "NodeB",
            "DIRECT",
        ]);
    });

    it("存在低倍率组时静态资源组优先使用低倍率节点", () => {
        const result = run(
            {},
            {
                proxies: [
                    { name: "香港01" },
                    { name: "香港02" },
                    { name: "美国01" },
                    { name: "美国02" },
                    { name: "香港 0.2x 大流量" },
                ],
            }
        );

        assert.deepEqual(group(result, PROXY_GROUPS.STATIC_RESOURCES)?.proxies, [
            PROXY_GROUPS.LOW_COST,
            PROXY_GROUPS.SELECT,
            "香港节点",
            "美国节点",
            PROXY_GROUPS.MANUAL,
            "DIRECT",
        ]);
        // 其他服务组仍保持正常顺序，低倍率组只移动一次。
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, [
            PROXY_GROUPS.SELECT,
            "香港节点",
            "美国节点",
            PROXY_GROUPS.LOW_COST,
            PROXY_GROUPS.MANUAL,
            "DIRECT",
        ]);
    });

    it("展平模式下静态资源组同样优先使用低倍率节点", () => {
        const result = run({}, { proxies: [{ name: "NodeA" }, { name: "NodeB 0.2x 大流量" }] });

        assert.deepEqual(group(result, PROXY_GROUPS.STATIC_RESOURCES)?.proxies, [
            PROXY_GROUPS.LOW_COST,
            "NodeA",
            "NodeB 0.2x 大流量",
            "DIRECT",
        ]);
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, [
            "NodeA",
            "NodeB 0.2x 大流量",
            PROXY_GROUPS.LOW_COST,
            "DIRECT",
        ]);
    });

    it("空 proxies 时所有代理组都不为空，且展平模式不生成手动选择组", () => {
        const result = run({}, { proxies: [] });
        const groups = result["proxy-groups"] ?? [];

        assert.deepEqual(group(result, PROXY_GROUPS.SELECT)?.proxies, ["DIRECT"]);
        assert.equal(group(result, PROXY_GROUPS.MANUAL), undefined);
        assert.deepEqual(group(result, PROXY_GROUPS.AUTO)?.proxies, ["DIRECT"]);
        assert.deepEqual(group(result, PROXY_GROUPS.FALLBACK)?.proxies, ["DIRECT"]);
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, ["DIRECT"]);
        assert.deepEqual(group(result, PROXY_GROUPS.FINANCE)?.proxies, ["DIRECT"]);

        for (const item of groups) {
            if (item.proxies) {
                assert.ok(item.proxies.length > 0, `${item.name} 不应包含空 proxies`);
            }
        }
    });

    it("全落地时保留落地节点组，前置代理仅包含 DIRECT", () => {
        const result = run({}, { proxies: [{ name: "落地A", "dialer-proxy": "前置代理" }] });

        assert.deepEqual(group(result, PROXY_GROUPS.LANDING)?.proxies, ["落地A"]);
        assert.deepEqual(group(result, PROXY_GROUPS.FRONT_PROXY)?.proxies, ["DIRECT"]);
        assert.deepEqual(group(result, PROXY_GROUPS.SELECT)?.proxies, [
            PROXY_GROUPS.LANDING,
            "DIRECT",
        ]);
        assert.deepEqual(group(result, PROXY_GROUPS.FALLBACK)?.proxies, [PROXY_GROUPS.LANDING]);
        assert.equal(group(result, PROXY_GROUPS.MANUAL), undefined);
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, [
            PROXY_GROUPS.LANDING,
            "DIRECT",
        ]);
        assert.deepEqual(group(result, PROXY_GROUPS.FINANCE)?.proxies, [
            PROXY_GROUPS.LANDING,
            "DIRECT",
        ]);
    });

    it("展平 + regex 时前置代理仍显式排除落地节点", () => {
        const result = run(
            { regex: "true" },
            {
                proxies: [
                    { name: "香港01" },
                    { name: "香港02" },
                    { name: "落地A", "dialer-proxy": "前置代理" },
                ],
            }
        );

        assert.deepEqual(group(result, PROXY_GROUPS.FRONT_PROXY)?.proxies, [
            "DIRECT",
            "香港01",
            "香港02",
        ]);
        assert.equal(group(result, PROXY_GROUPS.SELECT)?.["exclude-filter"], "^(?:落地A)$");
        assert.equal(group(result, PROXY_GROUPS.SELECT)?.["include-all"], true);

        const google = group(result, PROXY_GROUPS.GOOGLE);
        assert.equal(google?.["include-all"], true);
        assert.equal(google?.["exclude-filter"], "^(?:落地A)$");
        assert.deepEqual(google?.proxies, [
            PROXY_GROUPS.LANDING,
            PROXY_GROUPS.LOW_COST,
            PROXY_GROUPS.WARP,
            PROXY_GROUPS.GLOBAL_RESIDENTIAL,
            "DIRECT",
        ]);
        assert.deepEqual(group(result, PROXY_GROUPS.FINANCE)?.proxies, [
            PROXY_GROUPS.LANDING,
            PROXY_GROUPS.LOW_COST,
            PROXY_GROUPS.WARP,
            PROXY_GROUPS.GLOBAL_RESIDENTIAL,
            "DIRECT",
        ]);
    });

    it("只有台湾时服务组不引用未生成的地区组", () => {
        const result = run({}, { proxies: [{ name: "台湾01" }, { name: "台湾02" }] });
        const allGroupNames = (result["proxy-groups"] ?? []).map((item) => item.name);

        assert.ok(!allGroupNames.includes("台湾节点"));
        assert.deepEqual(group(result, PROXY_GROUPS.BAHAMUT)?.proxies, [
            "台湾01",
            "台湾02",
            "DIRECT",
        ]);
        assert.deepEqual(group(result, PROXY_GROUPS.BILIBILI)?.proxies, [
            "DIRECT",
            "台湾01",
            "台湾02",
        ]);
        assert.ok(!group(result, PROXY_GROUPS.BAHAMUT)?.proxies?.includes("台湾节点"));
        assert.ok(!group(result, PROXY_GROUPS.BILIBILI)?.proxies?.includes("台湾节点"));
        assert.ok(!group(result, PROXY_GROUPS.BAHAMUT)?.proxies?.includes(PROXY_GROUPS.SELECT));
        assert.ok(!group(result, PROXY_GROUPS.BILIBILI)?.proxies?.includes(PROXY_GROUPS.SELECT));
    });

    it("只有美国时 Truth Social 不引用未生成的地区组", () => {
        const result = run({}, { proxies: [{ name: "美国01" }, { name: "美国02" }] });

        assert.ok(!(result["proxy-groups"] ?? []).some((item) => item.name === "美国节点"));
        assert.deepEqual(group(result, PROXY_GROUPS.TRUTH_SOCIAL)?.proxies, [
            "美国01",
            "美国02",
            "DIRECT",
        ]);
        assert.ok(!group(result, PROXY_GROUPS.TRUTH_SOCIAL)?.proxies?.includes("美国节点"));
        assert.ok(
            !group(result, PROXY_GROUPS.TRUTH_SOCIAL)?.proxies?.includes(PROXY_GROUPS.SELECT)
        );
    });

    it("regex=true 时手动选择组使用 include-all，不枚举节点名称", () => {
        const result = run({ regex: "true" }, CONFIG);
        const manual = (result["proxy-groups"] ?? []).find(
            (group) => group.name === PROXY_GROUPS.MANUAL
        );

        assert.equal(manual?.["include-all"], true);
        assert.equal(manual?.proxies, undefined);
    });

    it("regex=false 时手动选择组仍按上游顺序枚举节点名称", () => {
        const result = run({}, CONFIG);
        const manual = (result["proxy-groups"] ?? []).find(
            (group) => group.name === PROXY_GROUPS.MANUAL
        );

        assert.equal(manual?.["include-all"], undefined);
        assert.deepEqual(
            manual?.proxies,
            CONFIG.proxies?.map((node) => node.name)
        );
    });

    it("Tailscale 组隐藏且不进入手动选择列表", () => {
        const result = run(
            {},
            {
                proxies: [
                    { name: "香港01" },
                    { name: "香港02" },
                    { name: "美国01" },
                    { name: "美国02" },
                    { name: "Tailscale出口", type: "tailscale" },
                ],
            }
        );

        const tailscale = group(result, PROXY_GROUPS.TAILSCALE);
        assert.equal(tailscale?.hidden, true);
        assert.deepEqual(tailscale?.proxies, ["Tailscale出口"]);

        assert.deepEqual(group(result, PROXY_GROUPS.MANUAL)?.proxies, [
            "香港01",
            "香港02",
            "美国01",
            "美国02",
        ]);
    });

    it("展平模式下 Tailscale 节点不进入任何常规选择列表", () => {
        const result = run(
            {},
            {
                proxies: [{ name: "香港01" }, { name: "Tailscale出口", type: "tailscale" }],
            }
        );

        assert.equal(group(result, PROXY_GROUPS.MANUAL), undefined);
        assert.deepEqual(group(result, PROXY_GROUPS.SELECT)?.proxies, ["香港01", "DIRECT"]);
        assert.deepEqual(group(result, PROXY_GROUPS.AUTO)?.proxies, ["香港01"]);
        assert.deepEqual(group(result, PROXY_GROUPS.FALLBACK)?.proxies, ["香港01"]);
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, ["香港01", "DIRECT"]);
        assert.equal(group(result, PROXY_GROUPS.TAILSCALE)?.hidden, true);
    });

    it("regex 分组模式下手动选择组排除 Tailscale", () => {
        const result = run(
            { regex: "true" },
            {
                proxies: [
                    { name: "香港01" },
                    { name: "香港02" },
                    { name: "美国01" },
                    { name: "美国02" },
                    { name: "Tailscale出口", type: "tailscale" },
                ],
            }
        );

        const manual = group(result, PROXY_GROUPS.MANUAL);
        assert.equal(manual?.["include-all"], true);
        assert.equal(manual?.["exclude-filter"], "^(?:Tailscale出口)$");
    });

    it("regex 地区组与低倍率组均排除 Tailscale", () => {
        const result = run(
            { regex: "true" },
            {
                proxies: [
                    { name: "香港01" },
                    { name: "香港02" },
                    { name: "美国01" },
                    { name: "美国02" },
                    { name: "美国-Tailscale 低倍率", type: "tailscale" },
                ],
            }
        );

        // fork：中间夹着 WARP / Global 家宽的排除规则，三段合并而非互相覆盖。
        assert.equal(
            group(result, "美国节点")?.["exclude-filter"],
            "美属|亚美尼亚|圣多美|普林西比|(?i:warp|cloudflare|^🌐)|^(?:美国-Tailscale 低倍率)$"
        );
        assert.equal(
            group(result, PROXY_GROUPS.LOW_COST)?.["exclude-filter"],
            "(?i:warp|cloudflare|^🌐)|^(?:美国-Tailscale 低倍率)$"
        );
    });

    it("regex 展平模式同时排除落地节点与 Tailscale", () => {
        const result = run(
            { regex: "true" },
            {
                proxies: [
                    { name: "香港01" },
                    { name: "落地A", "dialer-proxy": "前置代理" },
                    { name: "Tailscale出口", type: "tailscale" },
                ],
            }
        );

        const expected = "^(?:落地A|Tailscale出口)$";
        assert.equal(group(result, PROXY_GROUPS.SELECT)?.["exclude-filter"], expected);
        assert.equal(group(result, PROXY_GROUPS.GOOGLE)?.["exclude-filter"], expected);
        assert.equal(group(result, PROXY_GROUPS.TAILSCALE)?.hidden, true);
    });

    it("金融服务默认走选择代理", () => {
        const result = run({}, CONFIG);
        assert.deepEqual(group(result, PROXY_GROUPS.FINANCE)?.proxies, [
            PROXY_GROUPS.SELECT,
            "香港节点",
            "美国节点",
            PROXY_GROUPS.MANUAL,
            "DIRECT",
        ]);
    });

    it("游戏下载组默认直连，其次静态资源，再接常规候选", () => {
        const result = run({}, CONFIG);
        const game = group(result, PROXY_GROUPS.GAME_DOWNLOAD);
        assert.equal(game?.type, "select");
        assert.match(game?.icon ?? "", /\/Game\.png$/);
        assert.deepEqual(game?.proxies, [
            "DIRECT",
            PROXY_GROUPS.STATIC_RESOURCES,
            PROXY_GROUPS.SELECT,
            "香港节点",
            "美国节点",
            PROXY_GROUPS.MANUAL,
        ]);
    });

    it("SSH 组使用常规候选", () => {
        const result = run({}, CONFIG);
        const ssh = group(result, PROXY_GROUPS.SSH);
        assert.equal(ssh?.type, "select");
        assert.match(ssh?.icon ?? "", /\/Server\.png$/);
        assert.deepEqual(ssh?.proxies, group(result, PROXY_GROUPS.GOOGLE)?.proxies);
    });

    it("游戏下载紧跟静态资源，SSH 紧跟搜狗输入法", () => {
        const names = (run({}, CONFIG)["proxy-groups"] ?? []).map((item) => item.name);
        const at = (name: string) => names.indexOf(name);
        assert.equal(at(PROXY_GROUPS.GAME_DOWNLOAD), at(PROXY_GROUPS.STATIC_RESOURCES) + 1);
        assert.equal(at(PROXY_GROUPS.AI_SERVICE), at(PROXY_GROUPS.GAME_DOWNLOAD) + 1);
        assert.equal(at(PROXY_GROUPS.SSH), at(PROXY_GROUPS.SOGOU_INPUT) + 1);
    });

    it("Antigravity 组紧跟 AI服务，默认跟随 AI服务", () => {
        const result = run({}, CONFIG);
        const names = (result["proxy-groups"] ?? []).map((item) => item.name);
        assert.equal(
            names.indexOf(PROXY_GROUPS.ANTIGRAVITY),
            names.indexOf(PROXY_GROUPS.AI_SERVICE) + 1
        );

        const antigravity = group(result, PROXY_GROUPS.ANTIGRAVITY);
        assert.equal(antigravity?.type, "select");
        assert.equal(antigravity?.["include-all"], true);
        assert.match(antigravity?.icon ?? "", /\/Google_Search\.png$/);
        assert.deepEqual(antigravity?.proxies, [
            PROXY_GROUPS.AI_SERVICE,
            PROXY_GROUPS.SELECT,
            "香港节点",
            "美国节点",
            PROXY_GROUPS.MANUAL,
            "DIRECT",
        ]);
    });

    it("展平模式下 Antigravity 组仍以 AI服务 为首选", () => {
        const result = run({}, { proxies: [{ name: "NodeA" }, { name: "NodeB" }] });
        assert.deepEqual(group(result, PROXY_GROUPS.ANTIGRAVITY)?.proxies, [
            PROXY_GROUPS.AI_SERVICE,
            "NodeA",
            "NodeB",
            "DIRECT",
        ]);
    });

    it("规则引用的策略组都存在", () => {
        const inputs: Array<[ScriptArgs, ClashConfig]> = [
            [{}, CONFIG],
            [{ regex: "true", asn: "true" }, CONFIG],
            [{}, { proxies: [{ name: "NodeA" }, { name: "Tailscale出口", type: "tailscale" }] }],
            [{ adblock: "0" }, { proxies: [] }],
        ];
        for (const [args, config] of inputs) {
            const result = run(args, config);
            const targets = new Set([
                "DIRECT",
                "REJECT",
                ...(result["proxy-groups"] ?? []).map((item) => item.name),
            ]);
            for (const rule of result.rules ?? []) {
                const target =
                    rule
                        .replace(/,no-resolve$/, "")
                        .split(",")
                        .at(-1) ?? "";
                assert.ok(targets.has(target), `规则引用了不存在的策略组: ${rule}`);
            }
        }
    });

    it("asn 参数透传到规则构建", () => {
        assert.ok(!(run({}, CONFIG).rules ?? []).some((rule) => rule.startsWith("IP-ASN,")));
        assert.ok(
            (run({ asn: "true" }, CONFIG).rules ?? []).includes("IP-ASN,399358,AI服务,no-resolve")
        );
    });

    it("引用同一份规则集与 Geo 数据源", () => {
        const result = run({}, CONFIG);
        const providers = result["rule-providers"] ?? {};
        assert.equal(providers.SogouInput, ruleSets.SogouInput);
        assert.equal(providers.Weibo, ruleSets.Weibo);
        assert.equal(result["geodata-mode"], true);
        assert.ok(result["geox-url"]?.geoip);
    });

    it("adblock=0 时广告拦截组隐藏", () => {
        const result = run({ adblock: "0" }, CONFIG);
        assert.equal(group(result, PROXY_GROUPS.AD_BLOCK)?.hidden, true);
    });

    it("adblock>0 时广告拦截组可见", () => {
        const result = run({ adblock: "2" }, CONFIG);
        assert.equal(group(result, PROXY_GROUPS.AD_BLOCK)?.hidden, undefined);
    });

    it("adblock=0 时 rule-providers 不包含广告规则集", () => {
        const result = run({ adblock: "0" }, CONFIG);
        const providers = result["rule-providers"] ?? {};
        assert.ok(!("ADBlock" in providers));
        assert.ok(!("AdditionalFilter" in providers));
    });

    it("adblock=1 时 ADBlock 指向 adrules.top", () => {
        const result = run({ adblock: "1" }, CONFIG);
        const providers = result["rule-providers"] ?? {};
        assert.equal(providers.ADBlock?.url, "https://adrules.top/adrules-mihomo.mrs");
        assert.equal(providers.ADBlock?.format, "mrs");
        assert.ok("AdditionalFilter" in providers);
    });

    it("adblock=2 时 ADBlock 使用默认的 217heidai 规则集", () => {
        const result = run({ adblock: "2" }, CONFIG);
        const providers = result["rule-providers"] ?? {};
        assert.equal(providers.ADBlock, ruleSets.ADBlock);
        assert.ok("AdditionalFilter" in providers);
    });

    it("adblock=3 时 ADBlock 指向 AWAvenue", () => {
        const result = run({ adblock: "3" }, CONFIG);
        const providers = result["rule-providers"] ?? {};
        assert.match(providers.ADBlock?.url ?? "", /AWAvenue-Ads-Rule/);
        assert.equal(providers.ADBlock?.format, "mrs");
        assert.ok("AdditionalFilter" in providers);
    });

    it("非 regex 模式下 Weibo 组同样使用 include-all", () => {
        // fork：分组模式下服务组不分 regex 始终 include-all，让用户能直接选具体节点。
        const result = run({}, CONFIG);
        const weibo = group(result, PROXY_GROUPS.WEIBO);
        assert.equal(weibo?.["include-all"], true);
        assert.ok(weibo?.proxies !== undefined);
        assert.ok((weibo?.proxies?.length ?? 0) > 0);
    });

    it("分组模式下服务组不分 regex 始终 include-all，搜狗输入法与尾部固定组除外", () => {
        for (const args of [{}, { regex: "true" }]) {
            const result = run(args, CONFIG);
            for (const name of SERVICE_GROUP_NAMES) {
                assert.equal(group(result, name)?.["include-all"], true, name);
            }
            for (const name of [
                PROXY_GROUPS.SOGOU_INPUT,
                PROXY_GROUPS.AD_BLOCK,
                PROXY_GROUPS.FINAL,
            ]) {
                assert.equal(group(result, name)?.["include-all"], undefined, name);
            }
        }
    });

    it("展平、非 regex 时服务组不开 include-all，节点不重复", () => {
        const result = run({}, { proxies: [{ name: "NodeA" }, { name: "NodeB" }] });
        for (const name of SERVICE_GROUP_NAMES) {
            const item = group(result, name);
            assert.equal(item?.["include-all"], undefined, name);
            const proxies = item?.proxies ?? [];
            assert.equal(new Set(proxies).size, proxies.length, `${name} 有重复候选`);
            assert.ok(proxies.includes("NodeA") && proxies.includes("NodeB"), name);
        }
    });

    it("展平 + regex 时服务组的 include-all 来自展平节点来源", () => {
        const result = run({ regex: "true" }, { proxies: [{ name: "NodeA" }] });
        for (const name of SERVICE_GROUP_NAMES) {
            assert.equal(group(result, name)?.["include-all"], true, name);
        }
    });

    it("regex 模式下 Weibo 组使用 include-all", () => {
        const result = run({ regex: "true" }, CONFIG);
        const weibo = group(result, PROXY_GROUPS.WEIBO);
        assert.equal(weibo?.["include-all"], true);
    });
});

/** 代理组名在全部代理组中的位置。 */
function groupIndex(config: ClashConfig, name: string): number {
    return (config["proxy-groups"] ?? []).findIndex((item) => item.name === name);
}

/** 断言每个代理组的 proxies 只引用已生成的代理组、订阅节点或内置策略。 */
function assertNoDanglingRefs(config: ClashConfig): void {
    const known = new Set([
        "DIRECT",
        "REJECT",
        "REJECT-DROP",
        ...(config["proxy-groups"] ?? []).map((item) => item.name),
        ...(config.proxies ?? []).map((node) => node.name),
    ]);
    for (const item of config["proxy-groups"] ?? []) {
        for (const ref of item.proxies ?? []) {
            assert.ok(known.has(ref), `${item.name} 引用了不存在的 ${ref}`);
        }
    }
}

/** 按 mihomo 语义判断 `exclude-filter` 是否排除某个节点名（regexp2 搜索匹配）。 */
function excludes(filter: string | undefined, name: string): boolean {
    return filter !== undefined && new RegExp(filter).test(name);
}

const EXIT_FLOATING_CONFIG: ClashConfig = {
    proxies: [
        { name: "香港01" },
        { name: "香港02" },
        { name: "美国01" },
        { name: "美国02" },
        { name: "韩国01" },
        { name: "韩国02" },
        { name: "香港 0.2x 大流量" },
        { name: "Cloudflare WARP 🇺🇸" },
        { name: "warp-香港 0.2x" },
        { name: "🌐 家宽 多地区" },
        { name: "🌐 WARP 中转" },
    ],
};

describe("WARP节点 与 Global家宽", () => {
    it("枚举模式下单独成组，排在低倍率之后、地区组之前", () => {
        const result = run({}, EXIT_FLOATING_CONFIG);

        const warp = group(result, PROXY_GROUPS.WARP);
        assert.equal(warp?.type, "select");
        assert.match(warp?.icon ?? "", /\/Cloudflare\.png$/);
        assert.deepEqual(warp?.proxies, ["Cloudflare WARP 🇺🇸", "warp-香港 0.2x", "🌐 WARP 中转"]);

        const globalResidential = group(result, PROXY_GROUPS.GLOBAL_RESIDENTIAL);
        assert.equal(globalResidential?.type, "select");
        assert.match(globalResidential?.icon ?? "", /\/World_Map\.png$/);
        assert.deepEqual(globalResidential?.proxies, ["🌐 家宽 多地区"]);

        const lowCost = groupIndex(result, PROXY_GROUPS.LOW_COST);
        assert.equal(groupIndex(result, PROXY_GROUPS.WARP), lowCost + 1);
        assert.equal(groupIndex(result, PROXY_GROUPS.GLOBAL_RESIDENTIAL), lowCost + 2);
        assert.equal(groupIndex(result, "香港节点"), lowCost + 3);
    });

    it("不参与地区与低倍率归类", () => {
        const result = run({}, EXIT_FLOATING_CONFIG);
        assert.deepEqual(group(result, "香港节点")?.proxies, [
            "香港01",
            "香港02",
            "香港 0.2x 大流量",
        ]);
        assert.deepEqual(group(result, "美国节点")?.proxies, ["美国01", "美国02"]);
        assert.deepEqual(group(result, PROXY_GROUPS.LOW_COST)?.proxies, ["香港 0.2x 大流量"]);
    });

    it("进入选择代理与服务组候选，位于低倍率之后、手动选择之前", () => {
        const result = run({}, EXIT_FLOATING_CONFIG);
        const regions = ["香港节点", "韩国节点", "美国节点"];

        assert.deepEqual(group(result, PROXY_GROUPS.SELECT)?.proxies, [
            PROXY_GROUPS.AUTO,
            PROXY_GROUPS.FALLBACK,
            ...regions,
            PROXY_GROUPS.LOW_COST,
            PROXY_GROUPS.WARP,
            PROXY_GROUPS.GLOBAL_RESIDENTIAL,
            PROXY_GROUPS.MANUAL,
            "DIRECT",
        ]);
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, [
            PROXY_GROUPS.SELECT,
            ...regions,
            PROXY_GROUPS.LOW_COST,
            PROXY_GROUPS.WARP,
            PROXY_GROUPS.GLOBAL_RESIDENTIAL,
            PROXY_GROUPS.MANUAL,
            "DIRECT",
        ]);
        assert.deepEqual(group(result, PROXY_GROUPS.WEIBO)?.proxies, [
            "DIRECT",
            ...regions,
            PROXY_GROUPS.LOW_COST,
            PROXY_GROUPS.WARP,
            PROXY_GROUPS.GLOBAL_RESIDENTIAL,
            PROXY_GROUPS.SELECT,
            PROXY_GROUPS.MANUAL,
        ]);
        // 自动选择/故障转移只用地区组，不混入出口可变的节点。
        assert.deepEqual(group(result, PROXY_GROUPS.AUTO)?.proxies, regions);
        assertNoDanglingRefs(result);
    });

    it("没有对应节点时不生成分组，也不被引用", () => {
        const result = run({}, CONFIG);
        assert.equal(group(result, PROXY_GROUPS.WARP), undefined);
        assert.equal(group(result, PROXY_GROUPS.GLOBAL_RESIDENTIAL), undefined);
        assertNoDanglingRefs(result);
    });

    it("只有 WARP 节点时不生成 Global家宽 组", () => {
        const result = run({}, { proxies: [...(CONFIG.proxies ?? []), { name: "WARP 01" }] });
        assert.deepEqual(group(result, PROXY_GROUPS.WARP)?.proxies, ["WARP 01"]);
        assert.equal(group(result, PROXY_GROUPS.GLOBAL_RESIDENTIAL), undefined);
        assertNoDanglingRefs(result);
    });

    it("regex 模式下用 include-all + filter，Global家宽 排除 WARP", () => {
        const result = run({ regex: "true" }, CONFIG);

        const warp = group(result, PROXY_GROUPS.WARP);
        assert.equal(warp?.["include-all"], true);
        assert.equal(warp?.filter, "(?i)warp|cloudflare");
        assert.equal(warp?.["exclude-filter"], undefined);
        assert.equal(warp?.proxies, undefined);

        const globalResidential = group(result, PROXY_GROUPS.GLOBAL_RESIDENTIAL);
        assert.equal(globalResidential?.["include-all"], true);
        assert.equal(globalResidential?.filter, "(?i)^🌐");
        assert.equal(globalResidential?.["exclude-filter"], "(?i:warp|cloudflare)");
        assert.ok(excludes(globalResidential?.["exclude-filter"], "🌐 WARP 中转"));
        assert.ok(!excludes(globalResidential?.["exclude-filter"], "🌐 家宽 多地区"));
    });

    it("regex 模式下地区组与低倍率组的 exclude-filter 合并排除 WARP、Global 家宽与 Tailscale", () => {
        const tailscale = { name: "韩国-Tailscale 0.2x", type: "tailscale" };
        const result = run(
            { regex: "true" },
            { proxies: [...(EXIT_FLOATING_CONFIG.proxies ?? []), tailscale] }
        );

        const korea = group(result, "韩国节点")?.["exclude-filter"];
        assert.equal(
            korea,
            "北韩|North Korea|NORTH KOREA|(?i:warp|cloudflare|^🌐)|^(?:韩国-Tailscale 0\\.2x)$"
        );
        const hongKong = group(result, "香港节点")?.["exclude-filter"];
        assert.equal(hongKong, "(?i:warp|cloudflare|^🌐)|^(?:韩国-Tailscale 0\\.2x)$");
        const lowCost = group(result, PROXY_GROUPS.LOW_COST)?.["exclude-filter"];
        assert.equal(lowCost, "(?i:warp|cloudflare|^🌐)|^(?:韩国-Tailscale 0\\.2x)$");

        for (const filter of [korea, hongKong, lowCost]) {
            for (const name of [
                "Cloudflare WARP 🇺🇸",
                "warp-香港 0.2x",
                "🌐 家宽 多地区",
                "🌐 WARP 中转",
                "韩国-Tailscale 0.2x",
            ]) {
                assert.ok(excludes(filter, name), `${filter} 应排除 ${name}`);
            }
            for (const name of ["香港01", "韩国01", "香港 0.2x 大流量", "香港 🌐"]) {
                assert.ok(!excludes(filter, name), `${filter} 不应排除 ${name}`);
            }
        }
        assert.ok(excludes(korea, "North Korea 01"));
        assert.ok(excludes(korea, "北韩 02"));
    });

    it("展平模式下仍生成分组，排在低倍率之后且不引用手动选择", () => {
        const result = run(
            {},
            { proxies: [{ name: "NodeA" }, { name: "Cloudflare WARP" }, { name: "🌐 家宽" }] }
        );

        assert.equal(group(result, PROXY_GROUPS.MANUAL), undefined);
        assert.deepEqual(group(result, PROXY_GROUPS.WARP)?.proxies, ["Cloudflare WARP"]);
        assert.deepEqual(group(result, PROXY_GROUPS.GLOBAL_RESIDENTIAL)?.proxies, ["🌐 家宽"]);
        // 展平模式下 WARP / Global 节点仍是普通非落地节点，直接出现在上层代理组中。
        assert.deepEqual(group(result, PROXY_GROUPS.SELECT)?.proxies, [
            "NodeA",
            "Cloudflare WARP",
            "🌐 家宽",
            PROXY_GROUPS.WARP,
            PROXY_GROUPS.GLOBAL_RESIDENTIAL,
            "DIRECT",
        ]);
        assert.deepEqual(group(result, PROXY_GROUPS.AUTO)?.proxies, [
            "NodeA",
            "Cloudflare WARP",
            "🌐 家宽",
        ]);
        assert.deepEqual(group(result, PROXY_GROUPS.FINANCE)?.proxies, [
            "NodeA",
            "Cloudflare WARP",
            "🌐 家宽",
            PROXY_GROUPS.WARP,
            PROXY_GROUPS.GLOBAL_RESIDENTIAL,
            "DIRECT",
        ]);
        assertNoDanglingRefs(result);
    });

    it("展平 + regex 模式下同样不出现悬空引用", () => {
        const result = run(
            { regex: "true" },
            {
                proxies: [
                    { name: "NodeA" },
                    { name: "Cloudflare WARP" },
                    { name: "落地A", "dialer-proxy": "前置代理" },
                ],
            }
        );
        assert.equal(group(result, PROXY_GROUPS.MANUAL), undefined);
        assert.ok(group(result, PROXY_GROUPS.WARP));
        assert.ok(group(result, PROXY_GROUPS.GLOBAL_RESIDENTIAL));
        assertNoDanglingRefs(result);
    });

    it("只有 WARP 节点时自动选择与故障转移仍使用该节点", () => {
        const result = run({}, { proxies: [{ name: "Cloudflare WARP" }] });
        assert.deepEqual(group(result, PROXY_GROUPS.AUTO)?.proxies, ["Cloudflare WARP"]);
        assert.deepEqual(group(result, PROXY_GROUPS.FALLBACK)?.proxies, ["Cloudflare WARP"]);
    });
});
