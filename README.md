## powerfullz 的 Mihomo/Substore 覆写规则

![](img/cover.png)

[![](https://data.jsdelivr.com/v1/package/gh/powerfullz/override-rules/badge?style=rounded)](https://www.jsdelivr.com/package/gh/powerfullz/override-rules)

本仓库为 Mihomo/Substore 设计，提供高效、灵活的覆写规则（**不建议用于 Stash**）。核心特色如下：

* 集成 [SukkaW/Surge](https://github.com/SukkaW/Surge) 与 [217heidai/adblockfilters](https://github.com/217heidai/adblockfilters) 等优质规则，兼容性强，覆盖面广。
* 针对 Truth Social、E-Hentai、TikTok、加密货币等场景，新增专用分流规则，满足多样化需求。
* 精简冗余，结构清晰，维护便捷。
* 深度融合 [Loyalsoldier/v2ray-rules-dat](https://github.com/Loyalsoldier/v2ray-rules-dat) GeoSite/GeoIP，分流更精准。
* IP 规则默认添加 `no-resolve`，有效减少本地 DNS 解析，提升速度与隐私。
* 动态覆写：自动识别节点国家/地区，仅生成实际存在的分组，节点名称实时枚举，配置更智能。

> 本项目为本人自用，欢迎交流建议（Issue/PR）。如无特殊反馈，将优先满足个人需求与体验优化。

[点击访问 Forgejo 上的镜像](https://git.l3zc.com/powerfullz/override-rules)

### AFF

#### FlowerCloud

[注册链接](https://api-flowercloud.com/aff.php?aff=4352)

目前我的主力机场，也是一家老牌一线机场了，线路扎实，冗余足够，实验性节点0.2倍率，部分地区的高级节点是家宽落地，用起来还是很舒服的。

#### CNIX

[注册链接](https://nozomi.wtf/auth/register?code=2d50f605de)

开了很多年的一家机场，目前有各种针对不同运营商的优化线路。可玩性还是很高的，缺点就是审计规则比较多，而且禁止测速。

### 使用方法

**Clash Party/Sparkle**

> [!TIP]
> Clash Party 不支持给脚本传入参数，如果需要传入参数，请使用集成的 Substore。

1.  推荐直接使用 JS 动态覆写：`https://cdn.jsdelivr.net/gh/powerfullz/override-rules/convert.min.js`
2.  打开 Clash Party → 左侧「覆写」→ 粘贴上述链接导入。
3.  打开「订阅管理」→ 目标订阅右上角三个点 → 「编辑信息」→ 选择该覆写脚本 → 保存。

需要注意，Clash Party 在默认设置下还会接管 DNS 和 SNI（域名嗅探），需要手动在设置中关闭「控制 DNS 设置」和「控制域名嗅探」两个选项。

**Clash Verge 系（Clash Verge Rev、Clash Nyanpasu 等）**

直接复制需要的 YAML 格式覆写粘贴到覆写规则部分（无法自动更新）。

**SubStore**

参考[最速 Substore 订阅管理指南](https://blog.l3zc.com/2025/03/clash-subscription-convert/)。

2025/06/17 更新：新增 JavaScript 格式覆写，更易于维护，已经成为首选方式。JavaScript 格式覆写支持在脚本链接末尾加入`#`以传入参数，传入多个参数时，用`&`分隔，例如`#grouptype=2`。

目前支持的参数：

*   `grouptype`：地区代理组类型（0=手动选择 select，1=自动测速 url-test，2=负载均衡 load-balance，默认 1）
*   `ipv6`：启用 IPv6 支持（默认 false）
*   `full`：生成完整配置（适合纯内核启动，默认 false）
*   `keepalive`：启用 TCP Keep Alive（默认 false）[^fn2]
*   `fakeip`：DNS 增强模式使用 `fake-ip` 而不是 `redir-host`（开启后可能有助于解决 TUN 模式无法上网的问题；未传参时默认 `true`，显式传 `false` 时使用 `redir-host`）
*   `quic`：允许 QUIC 流量（UDP 443，默认 false）[^quic]
*   `regex`：各国家/地区代理组与分组模式下的「手动选择」组改用 `include-all` 模式，由 Mihomo 内核在运行时动态填充节点（地区组再附加正则 `filter`）；展平模式下的各服务组也直接使用同一套展平节点候选（`regex=true` 时为 `include-all`，并通过 `exclude-filter` 排除落地节点与 Tailscale 节点），而非在脚本执行时枚举节点名称（默认 false）[^regex]
*   `tun`：启用 TUN 模式（gvisor 栈，自动配置路由排除地址与 DNS 劫持，默认 false）。不用 mips 栈，是因为 mihomo v1.19.31 以前的内核不认识这个取值，会让整份配置加载失败
*   `threshold`：国家/地区节点数量小于该值时不显示分组（默认 2）；过滤后不足 2 个地区时自动展平，不再生成地区组
*   `adblock`：去广告规则（0=关闭，1=adrules.top，2=217heidai，3=AWAvenue，默认 3）
*   `asn`：为「AI服务」追加 `IP-ASN` 规则，覆盖 Anthropic, PBC 在 ARIN 名下的全部 5 个 ASN（399358、60808、4167、400243、401551），排在 Anthropic 的 IP 段规则之后（默认 false）。开启后客户端必须能下载 ASN 数据库（`GeoLite2-ASN.mmdb`），下载不到时整份配置加载失败。预生成的 YAML 覆写不包含这些规则

> **向后兼容**：旧的 `loadbalance` 参数仍然可用。当 `grouptype` 未指定时，`loadbalance=true` 等价于 `grouptype=2`，`loadbalance=false` 等价于 `grouptype=1`。

> **地区组展平**：`threshold` 过滤后不足 2 个地区时，`选择代理`、`自动选择`、`故障转移` 会直接使用非落地节点（存在落地节点时还会引用「落地节点」组），不会生成 `XX节点` 地区组，也不会生成与 `选择代理` 高度重合的「手动选择」组；各服务组也不再引用 `选择代理`，而是直接使用同一份展平节点来源。Tailscale 节点不会进入这些展平候选。`threshold=1` 且至少 2 个地区达标时仍按地区分组，并保留「手动选择」组。当某个代理组的候选列表为空时，构造层会自动补入 `DIRECT`（启用 `include-all` 的组除外），因此空订阅或全落地也不会产生空组。

[^quic]: 默认屏蔽了 QUIC 流量防止节点 UDP 性能不佳影响上网体验，如果确信节点质量良好，建议设置为 true。
[^regex]: 默认情况下覆写脚本会直接把节点都筛选好，如果想让内核来筛（比如，你在 Clash Party 客户端里额外添加了自建节点，想直接通过正则表达式筛选进入配置文件）那就打开吧。展平模式下同样使用 `include-all`，并通过 `exclude-filter` 排除落地节点与 Tailscale 节点，避免链式代理形成循环，也避免 Tailscale 混入通用选择列表。

说明：支持字符串 true/false 或 1/0；。注：预生成的 YAML 格式覆写（`yamls/` 目录）固定使用正则模式，不受此参数影响。

[^fn2]: 无特殊需求不要启用，否则会造成[移动设备异常耗电问题](https://github.com/vernesong/OpenClash/issues/2614)。

#### JS 覆写使用示例

想要国家/地区代理组自动选择延迟最低的节点，使用`grouptype=1`参数，在 Substore「脚本操作」处填入脚本链接：

```
https://cdn.jsdelivr.net/gh/powerfullz/override-rules/convert.min.js#grouptype=1
```

如果想第一时间体验最新加入的 ~~Bug~~ 功能，可以使用 preview 分支的 Github Raw 链接：

```
https://raw.githubusercontent.com/powerfullz/override-rules/refs/heads/preview/convert.min.js
```

### 关于 DNS 泄露的说明

很多人问用了这覆写规则跑 DNS 泄露测试说会泄露，为此我写了一篇文章澄清一些误解，具体请看[「关于 DNS 泄露及其相关误解的说明」](https://blog.l3zc.com/2026/05/dns-leak-misunderstanding/)。

### 关于部分特殊代理组的说明

**服务分组可直接选节点**：分组模式下（达标地区不少于 2 个），除「搜狗输入法」外的所有服务分组，在「选择代理」、各地区分组、「手动选择」等原有选项之后，还会通过 `include-all` 直接列出订阅中的所有节点，因此每个服务分组都可以单独指定具体节点、互不影响。「手动选择」和各地区分组则由所有服务分组共用，在其中切换节点会同时影响所有选用它们的服务分组。展平模式下服务分组的候选本来就直接列出了节点，不再追加 `include-all`，避免同一个节点重复出现。

**AI服务**：AI 相关规则排在最前面，只在 QUIC 拦截规则（`quic=false` 时生成）和「Antigravity」的规则之后，先于其他所有分流规则匹配，这样其他规则或代理组出问题时，AI 服务（包括各类 AI Agent）不会跟着失联。AI 域名的 QUIC 流量和其他域名一样被拒绝并退回 TCP。主规则 `GEOSITE,category-ai-!cn` 之后，还补了几条 geosite 没有收录的规则：`claude.app`（Claude Desktop 使用的域名）；`hcaptcha.com`、`challenges.cloudflare.com`、`arkoselabs.com`（Claude 与 ChatGPT 登录风控使用的人机验证，需要和 AI 服务走同一个出口）；以及 ARIN 直接分配给 Anthropic 的地址块 `160.79.104.0/21`、`153.61.0.0/16`、`2607:6bc0::/32`（兜底没有域名的连接）。需要按 ASN 匹配时见 `asn` 参数。

**Antigravity**：分流 Google Antigravity 的流量，包括它调用各家模型的请求，这些请求都经 Google 的 Cloud Code 接口转发。这些接口有几个是和其他产品共用的，所以以下流量也会跟着进入本组：Gemini CLI、Gemini Code Assist、Android Studio 中的 Gemini，以及所有 Vertex AI 接口（`aiplatform.googleapis.com` 及其区域端点）和企业版接口（`businessaicode`、`discoveryengine`）。本组规则排在「AI服务」之前，否则会先被 AI 规则匹配走。默认跟随「AI服务」，需要时可以单独切换。

**静态资源**：包含所有常见静态资源 CDN 域名、对象存储域名。大部分网站的静态资源（如图片、视频、音频、字体、JS、CSS）都有独立域名、不设置风控措施、不设置鉴权，这些静态资源可以使用 IP 不一定干净（例如 IDC 类 IP）、但是带宽更大、延时更低、而且有和大部分主流 CDN（如 Cloudflare、Akamai、Fastly、EdgeCast）在 IXP 有互联的网络出口。一般就实践经验来看，在正常上网中这部分域名产生的流量占据约 70% 左右。如果你在使用商业性质的远端策略服务提供商、且该服务上提供了低倍率节点，你可以将这部分域名分流至低倍率节点以节省流量。检测到「低倍率节点」组时，本组会自动将其置于候选首位，其余候选保持正常顺序。[^fn1]

[^fn1]: 来源：[我有特别的 Surge 配置和使用技巧](https://blog.skk.moe/post/i-have-my-unique-surge-setup/)

**Twitter静态资源**：Twitter 的图片、视频等静态资源域名（`twimg.com`、`assets.pscp.tv`、`cdn.cms-twdigitalassets.com`）。这些域名同时也在「静态资源」的规则集里，本组规则排在它前面，先把它们截住。默认跟随「静态资源」，也可以切到「Twitter」或其他出口。

**游戏下载**：覆盖 geosite `category-game-platforms-download` 收录的游戏平台客户端更新和游戏下载域名（Steam、Epic Games、Battle.net 等）。默认使用 `DIRECT`，也可以切换到「静态资源」、其他策略组或具体节点。

**金融服务**：默认走「选择代理」，候选顺序和其他服务分组一致，需要直连时手动切到 `DIRECT`。

**SSH**：分流目标端口为 22 的连接，默认走「选择代理」。这条规则排在局域网直连规则之后，所以连接局域网主机的 SSH 直连，不进入本组。

**搜狗输入**：默认放行，作用是避免搜狗输入法将你输入的每一个字符自动收集并通过`get.sogou.com/q`等域名回传。隐私担忧者可以将其设置为`REJECT`，开启后会影响搜狗输入法账号同步、词库更新、问题反馈，但语音输入等其他功能可以正常使用。

**WARP节点 / Global家宽**：名称含 `warp` 或 `cloudflare`（不区分大小写）的节点归入「WARP节点」，名称以 `🌐` 开头的节点（多地区家宽）归入「Global家宽」，两者同时命中时归 WARP。这两类节点的出口地区可以切换，不固定在某个国家，因此不进入任何国家/地区分组和「低倍率节点」组，而是各自单独成组（固定为 `select`），并出现在「选择代理」和各服务分组的候选列表中。订阅中没有对应节点时不生成该组（`regex=true` 时始终生成）。

**国家/地区归类**：节点名称以国旗 emoji 开头时，只按国旗确定地区。国旗代表实际出口，名称里的入口或中转关键字不参与判定，例如 `🇵🇭HKG->DITO` 归菲律宾、`🇨🇦Po0->US->Bell` 归加拿大。国旗不属于已支持的地区时，该节点不进入任何地区分组，仍可在「手动选择」等分组中选用。名称没有国旗时，仍按正则关键字匹配。按国旗归类只在默认的 `regex=false` 下生效；`regex=true` 和预生成的 YAML 覆写由 Mihomo 内核按正则筛选，同一节点可能同时进入多个地区分组。已支持的地区定义在 `src/catalog/countries.ts`，其中包括朝鲜（`🇰🇵`）。

~~**Play 商店修复**：~~ 修复国行设备因使用`services.googleapis.cn`域名导致的 Google Play 下载应用时的「等待中…」问题。详见：[「Google Play 商店的国内 CDN：从密码学入门到分流策略优化」](https://blog.l3zc.com/2025/03/chinese-cdn-used-by-playstore/)，已经是默认行为。

~~**Steam 修复**：~~ 用于让 Steam 客户端调用国内 CDN 及 P2P 网络下载，节省大量流量，已经是默认行为；相关域名优先于「游戏下载」匹配，固定使用 `DIRECT`。

### 关于链式代理的说明

对于使用机场线路配合自行购买的落地机进行链式代理的情况，在 Substore 添加自建节点时，加入`dialer-proxy: "前置代理"`脚本即可自动识别，并新增「前置代理」和「落地节点」两个代理组。检测到落地节点后，地区分类只扫描非落地节点；若订阅全部由落地节点组成，「前置代理」组仅保留 `DIRECT`。

![新增的代理组](img/dialer-group.png) ![如何配置自建节点](img/dialer-example.png)

### 关于 Tailscale 的说明

Mihomo 内核在近期的更新中支持了 Tailscale 出站，这覆写规则也做出了更新，当检测到订阅中存在`tailscale`类型的节点时，会自动配置相关的代理组、Tun 配置和分流规则，开箱即用，支持 Magic DNS，以下是 Tailscale 节点配置的示例：

「Tailscale」代理组默认带有 `hidden: true`，不会显示在客户端的代理组列表中；Tailscale 节点也不会进入「手动选择」、展平模式下的 `选择代理` / `自动选择` / `故障转移` / 各服务组，以及「前置代理」等常规候选列表，仅通过 `100.64.0.0/10`、`fd7a:115c:a1e0::/48` 和 `ts.net` 的定向分流规则使用。

```yaml
proxies:
  - name: "Tailscale出口"   # 注意节点名称不能为 Tailscale，否则会和代理组重名造成启动出错
    type: tailscale
    auth-key: tskey-auth-xxxxxxxx
    control-url: https://controlplane.tailscale.com
    ephemeral: true
    udp: true
```

### 关于自动生成的 YAML 格式覆写

除了直接引用动态构建的 JS 覆写脚本外，你也可以使用预先生成好的静态 YAML 覆写文件。这适用于某些不支持执行 JS 的客户端（例如旧版的 Clash Verge）。

> [!NOTE]
> 为了保持代码仓库的纯净，`main` 主分支不再跟踪和提交生成的产物文件（如 `convert.js` 和 `yamls/`）。
> 这些构建产物目前统一由 Github Actions 的 Release 工作流在发布 `v*` 版本时，构建并自动推送到当前分支及 Release 中；工作流会自动根据 Tag（例如 `v2.1.0`）同步 `package.json` / `package-lock.json` 的版本号，无需手动改版本。

获取 YAML 覆写文件的链接格式如下：

- **最新正式版**：`/yamls/*.yaml` (默认主分支或不带分支名)
- **特定历史版本**：`@vX.Y.Z/yamls/*.yaml`

文件命名规则依据支持的开关参数穷举，格式如下：

```text
config_gt-{0|1|2}_adblock-{0|1|2|3}_ipv6-{0|1}_full-{0|1}_keepalive-{0|1}_fakeip-{0|1}_quic-{0|1}_tun-{0|1}.yaml
```

**获取示例（开启 full，其余关闭）：**
```text
https://cdn.jsdelivr.net/gh/powerfullz/override-rules/yamls/config_gt-0_adblock-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
```

**固定版本获取示例：**
```text
https://cdn.jsdelivr.net/gh/powerfullz/override-rules@v0.1.0/yamls/config_gt-0_adblock-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
```

如果使用镜像：
```text
https://git.l3zc.com/powerfullz/override-rules/raw/branch/dist/yamls/config_gt-0_adblock-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
``````

*注：CI 仅套用了一份虚拟的 `fake_proxies.json` 来模拟生成 YAML，因此它无法像 JS 动态脚本那样根据你的实际节点智能生成专属分组策略，只能保守地包含常用的国家/地区。为了最高效的分流体验，仍强烈推荐使用 JS 覆写。*

### 如何自定义与贡献

**如果你想基于本项目深度定制自己专属的覆写规则：**

请阅读 [如何自定义专属覆写规则](docs/HOW_TO_CUSTOMISE.md)。里面详细介绍了如何修改默认参数、调整代理组及增添自定义的 Rule Providers。

**如果你想为本项目贡献代码或新增特性：**

请阅读 [贡献指南](docs/HOW_TO_CONTRIBUTE.md)。里面包含关于代码规范、开发流与提交 PR 的要求。

**如果你是 AI AGENT：**

请阅读 [`./AGENTS.md`](./AGENTS.md)。
