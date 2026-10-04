import { PROXY_GROUPS } from "./constants";
import { isNotNull } from "./utils";

/** Anthropic, PBC 在 ARIN（AP-2440）名下的全部 ASN */
const ANTHROPIC_ASNS = [399358, 60808, 4167, 400243, 401551];

/**
 * 构建最终的规则列表。
 *
 * @param {Object} params - 构建参数
 * @param {boolean} params.quicEnabled - 是否启用 QUIC（如未启用会插入 UDP:443 拦截规则）
 * @param {boolean} params.asnEnabled - 是否追加 Anthropic 的 IP-ASN 规则（依赖 ASN 数据库）
 * @param {boolean} tailscale - 是否有 Tailscale 节点
 * @returns {string[]} 规则字符串数组
 */
export function buildRules(
    { quicEnabled, asnEnabled }: { quicEnabled: boolean; asnEnabled: boolean },
    tailscale: boolean
): string[] {
    return [
        !quicEnabled ? `AND,((DST-PORT,443),(NETWORK,UDP)),REJECT` : null,
        // AI 服务紧随 QUIC 拦截，先于其它所有分流，避免其它规则出问题时 AI 连接受牵连；
        // AI 域名的 QUIC 仍被拒绝、退回 TCP
        `GEOSITE,category-ai-!cn,${PROXY_GROUPS.AI_SERVICE}`,
        // geosite 未收录的 AI 相关域名：Claude Desktop、Gemini CLI 的 Vertex 接口，
        // 以及 Claude/ChatGPT 登录风控用的人机验证（需与 AI 同出口）
        `DOMAIN-SUFFIX,claude.app,${PROXY_GROUPS.AI_SERVICE}`,
        // Vertex 区域端点形如 us-central1-aiplatform.googleapis.com，DOMAIN-SUFFIX 匹配不到
        `DOMAIN-REGEX,^([a-z0-9-]+-)?aiplatform\\.googleapis\\.com$,${PROXY_GROUPS.AI_SERVICE}`,
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
        tailscale ? `IP-CIDR,100.64.0.0/10,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
        tailscale ? `IP-CIDR,fd7a:115c:a1e0::/48,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
        tailscale ? `DOMAIN-SUFFIX,ts.net,${PROXY_GROUPS.TAILSCALE}` : null,
        `DST-PORT,22,${PROXY_GROUPS.SSH}`,
        `GEOIP,private,DIRECT,no-resolve`,
        `RULE-SET,ADBlock,${PROXY_GROUPS.AD_BLOCK}`,
        `RULE-SET,AdditionalFilter,${PROXY_GROUPS.AD_BLOCK}`,
        `RULE-SET,SogouInput,${PROXY_GROUPS.SOGOU_INPUT}`,
        `DOMAIN-SUFFIX,truthsocial.com,${PROXY_GROUPS.TRUTH_SOCIAL}`,
        `RULE-SET,SteamFix,DIRECT`,
        `GEOSITE,category-game-platforms-download,${PROXY_GROUPS.GAME_DOWNLOAD}`,
        `RULE-SET,StaticResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
        `RULE-SET,CDNResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
        `RULE-SET,AdditionalCDNResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
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
        `RULE-SET,Weibo,${PROXY_GROUPS.WEIBO}`,
        `RULE-SET,EHentai,${PROXY_GROUPS.EHENTAI}`,
        `RULE-SET,TikTok,${PROXY_GROUPS.TIKTOK}`,
        `RULE-SET,GoogleFCM,DIRECT`,
        `GEOSITE,google-play@cn,DIRECT`,
        `GEOSITE,microsoft@cn,DIRECT`,
        `GEOSITE,apple,${PROXY_GROUPS.APPLE}`,
        `GEOSITE,microsoft,${PROXY_GROUPS.MICROSOFT}`,
        `GEOSITE,google,${PROXY_GROUPS.GOOGLE}`,
        `RULE-SET,GFWList,${PROXY_GROUPS.SELECT}`,
        `GEOIP,cn,DIRECT`,
        `MATCH,${PROXY_GROUPS.FINAL}`,
    ].filter(isNotNull);
}
