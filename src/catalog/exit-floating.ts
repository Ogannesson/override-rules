/**
 * 出口地区可切换的节点的匹配规则：这类节点不进地区组与低倍率组，各自单独成组。
 */

import { createCaseInsensitiveNodeMatcher } from "../utils/regex";

/** 匹配 Cloudflare WARP 出口节点名称的正则（名称含 warp/cloudflare）。 */
export const WARP_NODE_MATCHER = createCaseInsensitiveNodeMatcher(String.raw`warp|cloudflare`);

/** 名称以 🌐 开头的节点：出口地区可切换的多地区家宽。 */
export const GLOBAL_RESIDENTIAL_NODE_MATCHER = createCaseInsensitiveNodeMatcher(String.raw`^🌐`);
