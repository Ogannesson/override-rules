import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRules, type BuildRulesInput } from "../../src/builders/rules";
import { ruleSets } from "../../src/catalog/rule-sets";

function rulesWith(overrides: Partial<BuildRulesInput> = {}): string[] {
    return buildRules({
        quicEnabled: false,
        hasTailscale: true,
        adblockSource: 3,
        asnEnabled: false,
        ...overrides,
    });
}

const ANTIGRAVITY_RULES = [
    "DOMAIN,cloudcode-pa.googleapis.com,Antigravity",
    "DOMAIN,daily-cloudcode-pa.googleapis.com,Antigravity",
    "DOMAIN,daily-cloudcode-pa.sandbox.googleapis.com,Antigravity",
    "DOMAIN-SUFFIX,aicode.googleapis.com,Antigravity",
    "DOMAIN-SUFFIX,antigravity.google,Antigravity",
    "DOMAIN-SUFFIX,antigravity.google.com,Antigravity",
    "DOMAIN-SUFFIX,antigravity-unleash.goog,Antigravity",
    "DOMAIN,antigravity-pa.googleapis.com,Antigravity",
    "DOMAIN,antigravity.googleapis.com,Antigravity",
    "DOMAIN-REGEX,^antigravity-([a-z]+-)?auto-updater-[0-9]+\\.[a-z0-9-]+\\.run\\.app$,Antigravity",
    "DOMAIN-REGEX,^businessaicode(\\.(us|eu)\\.rep|\\.mtls)?\\.googleapis\\.com$,Antigravity",
    "DOMAIN-REGEX,^([a-z0-9-]+-)?aiplatform(\\.(us|eu)\\.rep|\\.mtls)?\\.googleapis\\.com$,Antigravity",
    "DOMAIN-REGEX,^((us|eu)-)?discoveryengine(\\.mtls)?\\.googleapis\\.com$,Antigravity",
];

const AI_HEAD_RULES = [
    "GEOSITE,category-ai-!cn,AI服务",
    "DOMAIN-SUFFIX,claude.app,AI服务",
    "DOMAIN-SUFFIX,hcaptcha.com,AI服务",
    "DOMAIN,challenges.cloudflare.com,AI服务",
    "DOMAIN-SUFFIX,arkoselabs.com,AI服务",
    "IP-CIDR,160.79.104.0/21,AI服务,no-resolve",
    "IP-CIDR,153.61.0.0/16,AI服务,no-resolve",
    "IP-CIDR6,2607:6bc0::/32,AI服务,no-resolve",
];

const AI_ASN_RULES = [399358, 60808, 4167, 400243, 401551].map(
    (asn) => `IP-ASN,${asn},AI服务,no-resolve`
);

/**
 * 每条 DOMAIN-REGEX 规则的正例与反例主机名。新增 DOMAIN-REGEX 规则时必须在此补充用例。
 */
const DOMAIN_REGEX_CASES: Record<string, { match: string[]; noMatch: string[] }> = {
    "^antigravity-([a-z]+-)?auto-updater-[0-9]+\\.[a-z0-9-]+\\.run\\.app$": {
        match: [
            "antigravity-ide-auto-updater-974169037036.us-central1.run.app",
            "antigravity-auto-updater-974169037036.us-central1.run.app",
            "antigravity-auto-updater-1.europe-west1.run.app",
        ],
        noMatch: [
            "other-service.us-central1.run.app",
            "antigravity-auto-updater.us-central1.run.app",
            "antigravity-ide-2-auto-updater-1.us-central1.run.app",
            "antigravity-auto-updater-1.us-central1.run.app.evil.com",
            "xantigravity-auto-updater-1.us-central1.run.app",
        ],
    },
    "^businessaicode(\\.(us|eu)\\.rep|\\.mtls)?\\.googleapis\\.com$": {
        match: [
            "businessaicode.googleapis.com",
            "businessaicode.us.rep.googleapis.com",
            "businessaicode.eu.rep.googleapis.com",
            "businessaicode.mtls.googleapis.com",
        ],
        noMatch: [
            "xbusinessaicode.googleapis.com",
            "businessaicode.asia.rep.googleapis.com",
            "businessaicode.googleapis.com.evil.com",
            "foo.businessaicode.googleapis.com",
        ],
    },
    "^([a-z0-9-]+-)?aiplatform(\\.(us|eu)\\.rep|\\.mtls)?\\.googleapis\\.com$": {
        match: [
            "aiplatform.googleapis.com",
            "us-central1-aiplatform.googleapis.com",
            "europe-west4-aiplatform.googleapis.com",
            "aiplatform.us.rep.googleapis.com",
            "aiplatform.eu.rep.googleapis.com",
            "aiplatform.mtls.googleapis.com",
            "us-central1-aiplatform.mtls.googleapis.com",
            "US-CENTRAL1-AIPLATFORM.GOOGLEAPIS.COM",
        ],
        noMatch: [
            "generativelanguage.googleapis.com",
            "xaiplatform.googleapis.com",
            "foo.us-central1-aiplatform.googleapis.com",
            "aiplatform.googleapis.com.evil.com",
            "aiplatformxgoogleapis.com",
            "aiplatform.asia.rep.googleapis.com",
        ],
    },
    "^((us|eu)-)?discoveryengine(\\.mtls)?\\.googleapis\\.com$": {
        match: [
            "discoveryengine.googleapis.com",
            "us-discoveryengine.googleapis.com",
            "eu-discoveryengine.mtls.googleapis.com",
            "discoveryengine.mtls.googleapis.com",
        ],
        noMatch: [
            "asia-discoveryengine.googleapis.com",
            "xdiscoveryengine.googleapis.com",
            "discoveryengine.googleapis.com.evil.com",
            "foo.discoveryengine.googleapis.com",
        ],
    },
};

/**
 * 按 mihomo 语义匹配 DOMAIN-REGEX：regexp2 以 IgnoreCase 编译、`MatchString` 搜索主机名，
 * 整串匹配由规则自身的 `^…$` 锚点保证。
 */
function domainRegexMatches(payload: string, host: string): boolean {
    return new RegExp(payload, "i").test(host);
}

/** 取出 `TYPE,payload,target[,option]` 中的 payload（DOMAIN-REGEX 的 payload 不含逗号）。 */
function domainRegexPayload(rule: string): string {
    return rule.split(",")[1];
}
describe("buildRules", () => {
    it("未启用 quic 时插入 UDP 443 拦截规则", () => {
        const rules = buildRules({
            quicEnabled: false,
            hasTailscale: false,
            adblockSource: 0,
            asnEnabled: false,
        });
        assert.equal(rules[0], "AND,((DST-PORT,443),(NETWORK,UDP)),REJECT");
    });

    it("启用 quic 时不插入拦截规则", () => {
        const rules = buildRules({
            quicEnabled: true,
            hasTailscale: false,
            adblockSource: 0,
            asnEnabled: false,
        });
        assert.ok(!rules.some((rule) => rule.startsWith("AND,")));
    });

    it("Tailscale 存在时生成对应分流规则", () => {
        const rules = buildRules({
            quicEnabled: true,
            hasTailscale: true,
            adblockSource: 0,
            asnEnabled: false,
        });
        assert.ok(rules.includes("IP-CIDR,100.64.0.0/10,Tailscale,no-resolve"));
        assert.ok(rules.includes("DOMAIN-SUFFIX,ts.net,Tailscale"));
    });

    it("Tailscale 不存在时不生成对应分流规则", () => {
        const rules = buildRules({
            quicEnabled: true,
            hasTailscale: false,
            adblockSource: 0,
            asnEnabled: false,
        });
        assert.ok(!rules.some((rule) => rule.includes("Tailscale")));
    });

    it("所有引用的规则集均已注册", () => {
        const rules = buildRules({
            quicEnabled: true,
            hasTailscale: true,
            adblockSource: 2,
            asnEnabled: true,
        });
        for (const rule of rules) {
            if (!rule.startsWith("RULE-SET,")) continue;
            const key = rule.split(",")[1];
            assert.ok(key in ruleSets, `未注册的规则集: ${key}`);
        }
    });

    it("以 MATCH 收尾", () => {
        const rules = buildRules({
            quicEnabled: true,
            hasTailscale: false,
            adblockSource: 0,
            asnEnabled: false,
        });
        assert.equal(rules.at(-1), "MATCH,Final");
    });

    it("adblock=0 时不包含任何广告拦截规则", () => {
        const rules = buildRules({
            quicEnabled: true,
            hasTailscale: false,
            adblockSource: 0,
            asnEnabled: false,
        });
        assert.ok(!rules.some((rule) => rule.includes("广告拦截")));
    });

    it("adblock>0 时统一引用 ADBlock 与 AdditionalFilter", () => {
        for (const adblockSource of [1, 2, 3] as const) {
            const rules = buildRules({
                quicEnabled: true,
                hasTailscale: false,
                adblockSource,
                asnEnabled: false,
            });
            assert.ok(rules.includes("RULE-SET,ADBlock,广告拦截"));
            assert.ok(rules.includes("RULE-SET,AdditionalFilter,广告拦截"));
        }
    });
});

describe("buildRules：Antigravity 与 AI服务 规则", () => {
    const HEAD_RULES = [...ANTIGRAVITY_RULES, ...AI_HEAD_RULES];

    it("Antigravity 紧跟 QUIC 拦截，AI服务 紧随其后，先于其余所有规则", () => {
        const rules = rulesWith();
        assert.equal(rules[0], "AND,((DST-PORT,443),(NETWORK,UDP)),REJECT");
        assert.deepEqual(rules.slice(1, 1 + HEAD_RULES.length), HEAD_RULES);
        assert.equal(rules[1 + HEAD_RULES.length], "IP-CIDR,100.64.0.0/10,Tailscale,no-resolve");
    });

    it("Antigravity 规则全部位于 category-ai-!cn 之前", () => {
        const rules = rulesWith();
        const aiGeosite = rules.indexOf("GEOSITE,category-ai-!cn,AI服务");
        const antigravity = rules
            .map((rule, index) => (rule.endsWith(",Antigravity") ? index : -1))
            .filter((index) => index >= 0);
        assert.equal(antigravity.length, ANTIGRAVITY_RULES.length);
        assert.ok(antigravity.every((index) => index < aiGeosite));
    });

    it("允许 QUIC 时 Antigravity 规则排第一", () => {
        const rules = rulesWith({ quicEnabled: true });
        assert.deepEqual(rules.slice(0, HEAD_RULES.length), HEAD_RULES);
    });

    it("geosite 的 AI 规则只出现一次", () => {
        const rules = rulesWith();
        assert.equal(rules.filter((rule) => rule === "GEOSITE,category-ai-!cn,AI服务").length, 1);
    });

    it("AI服务 不再包含 aiplatform 规则", () => {
        const rules = rulesWith({ asnEnabled: true });
        assert.ok(
            !rules.some((rule) => rule.includes("aiplatform") && rule.endsWith(",AI服务")),
            "aiplatform 已并入 Antigravity"
        );
    });

    it("asn 关闭时不输出 IP-ASN 规则", () => {
        assert.ok(!rulesWith().some((rule) => rule.startsWith("IP-ASN,")));
    });

    it("asn 开启时在补充规则之后追加 Anthropic 的 IP-ASN 规则", () => {
        const rules = rulesWith({ asnEnabled: true });
        const start = 1 + HEAD_RULES.length;
        assert.deepEqual(rules.slice(1, start), HEAD_RULES);
        assert.deepEqual(rules.slice(start, start + AI_ASN_RULES.length), AI_ASN_RULES);
        assert.equal(rules.filter((rule) => rule.startsWith("IP-ASN,")).length, 5);
    });
});

describe("buildRules：SSH 与游戏下载规则", () => {
    it("SSH 端口规则位于 Tailscale 规则之后、局域网直连之前", () => {
        const rules = rulesWith();
        const ssh = rules.indexOf("DST-PORT,22,SSH");
        assert.equal(rules[ssh - 1], "DOMAIN-SUFFIX,ts.net,Tailscale");
        assert.equal(rules[ssh + 1], "GEOIP,private,DIRECT,no-resolve");
    });

    it("无 Tailscale 时 SSH 端口规则仍在局域网直连之前", () => {
        const rules = rulesWith({ hasTailscale: false });
        const ssh = rules.indexOf("DST-PORT,22,SSH");
        assert.ok(ssh > 0);
        assert.equal(rules[ssh + 1], "GEOIP,private,DIRECT,no-resolve");
    });

    it("SteamFix 与游戏下载位于静态资源之前", () => {
        const rules = rulesWith();
        const steamFix = rules.indexOf("RULE-SET,SteamFix,DIRECT");
        assert.equal(rules[steamFix - 1], "DOMAIN-SUFFIX,truthsocial.com,Truth Social");
        assert.equal(rules[steamFix + 1], "GEOSITE,category-game-platforms-download,游戏下载");
        assert.ok(steamFix + 1 < rules.indexOf("RULE-SET,StaticResources,静态资源"));
        assert.equal(rules.filter((rule) => rule.includes("SteamFix")).length, 1);
    });

    it("Twitter 静态资源规则位于游戏下载之后、StaticResources 之前", () => {
        const rules = rulesWith();
        const game = rules.indexOf("GEOSITE,category-game-platforms-download,游戏下载");
        assert.deepEqual(rules.slice(game + 1, game + 5), [
            "DOMAIN-SUFFIX,twimg.com,Twitter静态资源",
            "DOMAIN,assets.pscp.tv,Twitter静态资源",
            "DOMAIN,cdn.cms-twdigitalassets.com,Twitter静态资源",
            "RULE-SET,StaticResources,静态资源",
        ]);
        assert.ok(rules.indexOf("GEOSITE,twitter,Twitter") > game + 4);
    });

    it("不包含上游已删除的 GoogleFCM 规则", () => {
        assert.ok(!rulesWith().some((rule) => rule.includes("GoogleFCM")));
    });
});

describe("buildRules：DOMAIN-REGEX 规则", () => {
    const domainRegexRules = rulesWith({ asnEnabled: true }).filter((rule) =>
        rule.startsWith("DOMAIN-REGEX,")
    );

    it("每条 DOMAIN-REGEX 规则都有对应用例", () => {
        assert.ok(domainRegexRules.length > 0);
        for (const rule of domainRegexRules) {
            assert.ok(domainRegexPayload(rule) in DOMAIN_REGEX_CASES, `缺少用例: ${rule}`);
        }
    });

    for (const [payload, cases] of Object.entries(DOMAIN_REGEX_CASES)) {
        it(`${payload} 只匹配预期主机名`, () => {
            assert.ok(domainRegexRules.some((rule) => domainRegexPayload(rule) === payload));
            for (const host of cases.match) {
                assert.ok(domainRegexMatches(payload, host), `应匹配: ${host}`);
            }
            for (const host of cases.noMatch) {
                assert.ok(!domainRegexMatches(payload, host), `不应匹配: ${host}`);
            }
        });
    }
});
