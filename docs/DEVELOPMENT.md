# 开发说明

面向想读代码或改代码的人。用户向的说明在 [README](../README.md)。

## 项目结构

```
dsh-plugin-salary-dance/
├── package.json          # bundle 清单：dsh.bundle.patch + dsh.client
├── cordis.patch.yml      # 向 profile 插入 id 为 salarydance 的 Loader row
├── index.js              # Host 半：空实现（功能全在浏览器侧）
├── client.js             # 浏览器半：卡片 + 设置面板 + 全部计算
├── icon.svg              # 插件管理器卡片图标
├── locale/{zh,en}.json   # 插件标题与描述
├── test/math.test.mjs    # 无浏览器回归测试
├── docs/preview.svg      # README 里那张结构示意图
└── LICENSE / README.md
```

`client.js` 就是产物：纯 JS + `React.createElement`，没有 JSX、没有打包器、没有运行时依赖。改一行刷新即可生效。

## 它是怎么运作的

DSH 把界面插件组织成 **bundle**：只要 npm 包在 `package.json` 里声明 `dsh.bundle.patch`，它的 YAML patch 就会被叠加进 profile 的插件树。

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },          // 插入 Loader row
  "client": { "platform": "web", "immediately": true }  // 浏览器半 + 启动即载
}
```

- `cordis.patch.yml` 插入一行 `id: salarydance`、`name: dsh-plugin-salary-dance`。row id 是配置覆盖用的锚点，与包名保持一致，所以插件管理器卡片上显示的行名就是 `salarydance`。
- `index.js` 是 Host 半，导出 `apply()`。这里刻意什么都不做，让 bundle 在没有 Web 载体的 Host 上依然合法。
- `client.js` 是浏览器半，用 `window.__ModuleLoader__.load({ id, factory })` 注册工厂，`apply(ctx)` 里通过 `ctx.effect` 注入样式、注册中英文字典、把组件挂到 `shell.overlay` 插槽。注册都挂在 effect 上，插件被禁用或卸载时会一起回收。

样式只使用 DSH 主题变量（`--dsw-alias-*` / `--dsw-radius-*` / `--dsw-shadow-*` / `--dsw-static-amber-*`），不 import 任何 DSH Client 包，只用两样宿主能力：插槽服务与 locale 服务（声明在 `inject = ['slots', 'locale']`）。两者都缺失时插件不挂载，而不是抛错。

## 位置与头像

- 卡片用 `left` / `top` 锚定，默认左上角（`{ left: 12, top: 56 }`）。位置存在
  `dsh-plugin-salary-dance/pos.v1`，**拖动结束才写一次**，不会每帧写 localStorage。
  读回时用 `clampPos` 夹进当前窗口，窗口变小也不会跑到屏幕外。
- 精简视图比完整视图窄（236 vs 296px）—— 它默认压在对话侧栏（280px）上，窄一点
  能少挡些内容。真正解决遮挡的是"拖动 + 记住位置"。
- 头像 `Avatar({ mode })` 是一段内联 SVG，只用 `currentColor`，所以跟随宿主主题的
  黑白。动作靠两条 CSS 动画（球弹跳 + 手臂摆动）：
  `mode = work` 正常 .9s，`break` 放慢到 3.2s，`off` 用 `animation-play-state: paused`
  停住并降到 45% 透明度。`prefers-reduced-motion` 下不播动画。
- `mode` 由 `avatarMode` 决定：休息日或已下班为 `off`，午休为 `break`，其余 `work`。

## 跳动是怎么来的

`earned(t)` 是计算口径在时刻 `t` 的值，`t` 保留到毫秒，本身就是连续函数，所以**没有任何插值**：

- 一个按帧递增的计数器触发重渲染，金额在渲染时用当前时钟现算。
- 一次一秒的心跳只刷新**月份级**的量：当月实际工作日、费率、休息日判断。
- 显示值**向下取整到 4 位小数**，卡片永远不会显示还没赚到的钱。

时薪 ¥55.5556/时 ≈ 每秒 ¥0.0154，最低位约每 6.5 毫秒变一次；60fps 下约每 4 帧一动。`prefers-reduced-motion` 下退化为整秒更新。

## 测试

```bash
npm test
```

`test/math.test.mjs` 不需要浏览器、无依赖：自带一个假的 `window.__ModuleLoader__` 与 hooks 桩（含 effect 刷新与跨帧持久状态），因此可以逐帧驱动真实组件。覆盖节假日日历、时薪口径、班次解算、跨夜班次、午休冻结、跳动（逐帧断言只增不减、不超前真值）、文案中英对齐等。

内置节假日表按这套表算出的每月实际工作日：

| 月 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | 19 | 19 | 21 | 22 | 19 | 20 | 23 | 21 | 23 | 18 | 20 | 23 |
| 2026 | 21 | 16 | 22 | 21 | 19 | 21 | 23 | 21 | 22 | 18 | 21 | 23 |

这些数字有回归测试覆盖。补表时按国务院办公厅通知逐条录入，并同步这张表。

## 本地调试

```bash
git clone https://github.com/zhouxf08/dsh-plugin-salary-dance.git
cd dsh-plugin-salary-dance
npm test
dsh plugin --profile desktop add "$PWD"    # 链接进 profile 调试
```

改完 `client.js` 后：宿主开着 HMR 时刷新页面即可拿到新 bundle（版本号按文件 mtime/size 计算），否则重启 `dsh web` 或桌面版。

**桌面版有个坑**：它在启动时组合 profile，装了新版本必须 `⌘Q` 完全退出再打开。Web 界面里改代码、刷新页面是看不到改动的 —— 换了 bundle 内容也必须重启。

## 兼容性

| 项 | 值 |
| --- | --- |
| 类型 | DSH Web 界面插件（bundle） |
| 适用 profile | `desktop`、`web` 等带浏览器载体的 profile |
| 不适用 | `tui`、`headless` 等无浏览器载体的 profile |
| DSH 版本 | 在 `0.2.0-rc.2` 上开发与验证 |
| Cordis | `~4.0.4` |
| 运行时依赖 | 无 |
| 网络 | 不使用 |
