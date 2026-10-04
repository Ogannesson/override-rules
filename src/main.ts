/*!
powerfullz 的 Substore 订阅转换脚本
https://github.com/powerfullz/override-rules

支持的传入参数：
- grouptype: 地区代理组类型（0=select 手动选择, 1=url-test 自动测速, 2=load-balance 负载均衡，默认 0）
  - 向后兼容：若未传 grouptype 但传了 loadbalance，则 loadbalance=true 映射为 grouptype=2，loadbalance=false 映射为 grouptype=1
- landing: auto-detected from nodes with `dialer-proxy` field; no user parameter needed
- ipv6: 启用 IPv6 支持（默认 false）
- tun: 启用 TUN 模式（默认 false）
- full: 输出完整配置（适合纯内核启动，默认 false）
- keepalive: 启用 tcp-keep-alive（默认 false）
- fakeip: DNS 使用 FakeIP 模式（默认 true；传 false 时为 RedirHost）
- quic: 允许 QUIC 流量（UDP 443，默认 false）
- threshold: 地区节点数量小于该值时不显示分组 (默认 0)
- regex: 使用正则过滤模式（include-all + filter）写入各地区代理组，而非直接枚举节点名称（默认 false）
- asn: 为 AI服务 追加 Anthropic 全部 ASN 的 IP-ASN 规则（默认 false；开启后需能下载 ASN 数据库，否则整份配置加载失败）

WARP 出口分组：自动识别名称含 warp/cloudflare 的节点并单独成组（挂到各服务分组候选），无需传参。
Global家宽分组：名称以 🌐 开头的多地区家宽节点同样单独成组，不进地区分组。
地区归类：节点名称以国旗开头时只按国旗归入对应地区，未知国旗不归入任何地区（仅枚举模式；regex 模式仍按正则匹配）。

源码已迁移至 `src/*.ts`。
*/

import { CDN_URL, PROXY_GROUPS } from "./constants";
import { buildFeatureFlags } from "./args";
import { buildProxyGroups } from "./proxy_groups";
import {
    getActiveCountryNames,
    parseCountries,
    parseGlobalResidential,
    parseLowCost,
    parseNodesByLanding,
    parseTailscale,
    parseWarp,
} from "./node_parser";
import { buildRules } from "./rules";
import { ruleProviders } from "./rule_providers";
import { buildDns, snifferConfig } from "./dns";
import { buildTunConfig } from "./tun";
import { buildBaseLists } from "./selectors";
import type { ClashConfig, ScriptArgs } from "./types";

const geoxURL = {
    geoip: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/geoip.dat`,
    geosite: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/geosite.dat`,
    mmdb: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/country.mmdb`,
    asn: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb`,
};

declare const $arguments: ScriptArgs;

function getRawArgs(): ScriptArgs {
    try {
        return $arguments;
    } catch {
        // console.log("[powerfullz 的覆写脚本] 未检测到传入参数，使用默认参数。");
        return {};
    }
}

const rawArgs = getRawArgs();
const {
    groupType,
    ipv6Enabled,
    fullConfig,
    keepAliveEnabled,
    fakeIPEnabled,
    quicEnabled,
    regexFilter,
    tunEnabled,
    asnEnabled,
    countryThreshold,
} = buildFeatureFlags(rawArgs);

function main(config: ClashConfig): ClashConfig {
    if (!config.proxies || !Array.isArray(config.proxies)) {
        throw new Error("[powerfullz 的覆写脚本] 错误：Clash 配置中缺少有效的 proxies 字段");
    }
    const { landingNodes, nonLandingNodes } = parseNodesByLanding(config.proxies);
    const landing = landingNodes.length > 0 && nonLandingNodes.length > 0;
    const candidateNodes = landing ? nonLandingNodes : config.proxies;
    const warpNodes = parseWarp(candidateNodes);
    const globalResidentialNodes = parseGlobalResidential(candidateNodes);
    // WARP 与 Global 家宽节点出口地区可变，不参与地区分类与低倍率分组，先从候选集中剔除
    const exitFloatingNodes = new Set([...warpNodes, ...globalResidentialNodes]);
    const classifiableNodes = candidateNodes.filter((node) => !exitFloatingNodes.has(node));
    const countryNodes = parseCountries(classifiableNodes);
    const lowCostNodes = parseLowCost(classifiableNodes);
    const countryNames = getActiveCountryNames(countryNodes, countryThreshold);
    const allNodes = config.proxies.map((node) => node.name);
    const tailscaleNodes = parseTailscale(config.proxies);
    const hasTailscale = tailscaleNodes.length > 0;

    const {
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        defaultFallback,
        frontProxySelector,
    } = buildBaseLists({
        landing,
        lowCostNodes,
        warpNodes,
        globalResidentialNodes,
        countryNames,
        nonLandingNodes,
        regexFilter,
    });

    const proxyGroups = buildProxyGroups({
        allNodes,
        regexFilter,
        groupType,
        countryNames,
        countryNodes,
        lowCostNodes,
        warpNodes,
        globalResidentialNodes,
        tailscaleNodes,
        landing,
        landingNodes,
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        defaultFallback,
        frontProxySelector,
    });

    const globalProxies = proxyGroups.map((item) => String(item.name));
    proxyGroups.push({
        name: PROXY_GROUPS.GLOBAL,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Global.png`,
        "include-all": true,
        type: "select",
        proxies: globalProxies,
    });

    const finalRules = buildRules({ quicEnabled, asnEnabled }, hasTailscale);

    return {
        proxies: config.proxies,
        ...(config.hosts !== undefined && { hosts: config.hosts }),
        ...(fullConfig && {
            "mixed-port": 7890,
            "redir-port": 7892,
            "tproxy-port": 7893,
            "routing-mark": 7894,
            "allow-lan": true,
            "bind-address": "*",
            ipv6: ipv6Enabled,
            mode: "rule",
            "unified-delay": true,
            "tcp-concurrent": true,
            "find-process-mode": "off",
            "log-level": "info",
            "geodata-loader": "standard",
            "external-controller": ":9999",
            "disable-keep-alive": !keepAliveEnabled,
            profile: { "store-selected": true },
        }),
        "proxy-groups": proxyGroups,
        "rule-providers": ruleProviders,
        rules: finalRules,
        sniffer: snifferConfig,
        dns: buildDns({ fakeIPEnabled, ipv6Enabled, upstreamDns: config.dns }),
        tun: buildTunConfig(tunEnabled, hasTailscale),
        "geodata-mode": true,
        "geox-url": geoxURL,
    };
}

(globalThis as Record<string, unknown>).main = main;
