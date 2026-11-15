/**
 * 分流规则
 *
 * 规则中引用的规则集名称通过 `ruleSet()` 生成，受 `RuleSetKey` 类型约束，
 * 不会出现引用未注册规则集的静默错误。
 */

import { PROXY_GROUPS } from "../catalog/group-names";
import { ruleSet } from "../catalog/rule-sets";
import { isNotNull } from "../utils/primitives";
import type { AdblockSource } from "../types/args";

/** Anthropic, PBC 在 ARIN（AP-2440）名下的全部 ASN */
const ANTHROPIC_ASNS = [399358, 60808, 4167, 400243, 401551];

export interface BuildRulesInput {
    quicEnabled: boolean;
    hasTailscale: boolean;
    adblockSource: AdblockSource;
    asnEnabled: boolean;
}

/**
 * 构建最终的规则列表。
 * @param input.quicEnabled - 是否允许 QUIC（未启用时插入 UDP:443 拦截规则）
 * @param input.hasTailscale - 是否存在 Tailscale 节点（决定是否生成 Tailscale 分流规则）
 * @param input.adblockSource - 去广告规则来源（0=关闭，1=adrules.top，2=217heidai，3=AWAvenue）
 * @param input.asnEnabled - 是否追加 Anthropic 的 IP-ASN 规则（依赖 ASN 数据库）
 */
export function buildRules({
    quicEnabled,
    hasTailscale,
    adblockSource,
    asnEnabled,
}: BuildRulesInput): string[] {
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
        ...(asnEnabled
            ? ANTHROPIC_ASNS.map((asn) => `IP-ASN,${asn},${PROXY_GROUPS.AI_SERVICE},no-resolve`)
            : []),
        hasTailscale ? `IP-CIDR,100.64.0.0/10,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
        hasTailscale ? `IP-CIDR,fd7a:115c:a1e0::/48,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
        hasTailscale ? `DOMAIN-SUFFIX,ts.net,${PROXY_GROUPS.TAILSCALE}` : null,
        `DST-PORT,22,${PROXY_GROUPS.SSH}`,
        `GEOIP,private,DIRECT,no-resolve`,
        adblockSource > 0 ? ruleSet("ADBlock", PROXY_GROUPS.AD_BLOCK) : null,
        adblockSource > 0 ? ruleSet("AdditionalFilter", PROXY_GROUPS.AD_BLOCK) : null,
        ruleSet("SogouInput", PROXY_GROUPS.SOGOU_INPUT),
        `DOMAIN-SUFFIX,truthsocial.com,${PROXY_GROUPS.TRUTH_SOCIAL}`,
        ruleSet("SteamFix", "DIRECT"),
        `GEOSITE,category-game-platforms-download,${PROXY_GROUPS.GAME_DOWNLOAD}`,
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
        `MATCH,${PROXY_GROUPS.FINAL}`,
    ].filter(isNotNull);
}
