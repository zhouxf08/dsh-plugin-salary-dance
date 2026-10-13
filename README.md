# 薪跳 SalaryDance

> 常驻 DSH Web 界面右上角的实时薪资跳动悬浮卡片。

一块小小的卡片，把「今天赚了多少」变成一个会自己往上跳的数字：今日入账、已工作、距离下班、今日预计，再加一条工作进度轴。点开就是三步设置面板 —— **薪资模式 / 工作时间 / 使用偏好** —— 设一次，之后自动记住。

![薪跳 SalaryDance](docs/preview.svg)

> 说明：上面这张是界面结构示意图（矢量线框），不是运行截图。真实外观请装上后在 DSH Web 界面里看。

---

## 功能

**悬浮卡片**

| 区域 | 内容 |
| --- | --- |
| 顶部 | 状态灯 + 「薪跳 SalaryDance」+ 当前状态（正在上班 / 还未上班 / 已下班 / 今日休息）|
| 主数字 | 今日入账 `¥301.49`，每秒跳动，千分位分组 |
| 三栏 | 已工作 / 距离下班 / 今日预计 |
| 进度轴 | 今日工作进度，圆点跟随 |
| 底部 | 本月预计总额 |

- **可拖动**：按住卡片顶部可以拖到任意位置，自动限制在窗口内。
- **可收起**：右上角 `×` 收起为纯数字小卡片（配合「迷你悬浮模式」）。
- **自动计时**：秒级刷新；迷你模式下停止计时，不占用资源。
- **深浅色**：浅色 / 深色 / 跟随系统；默认使用 DSH 主题变量，跟随宿主主题不跑偏。

**三步设置面板**（对齐参考设计稿）

1. **薪资模式** —— 月薪 / 日薪 / 时薪。月薪按当月实际工作日摊到每天（例如 8000 元、当月 22 个工作日 → 每天 ¥363.64）。
2. **工作时间** —— 工作日多选（一~日）、上班时间、下班时间、可选午休时段（不计入工作时长）。**支持跨夜班次**：下班时间早于上班时间即视为次日下班（22:00 → 06:00 可用）。
3. **使用偏好** —— 主题、窗口始终置顶、迷你悬浮模式、开机自动启动。底部固定显示「所有配置仅保存在本地」说明。

**离线、无账号**：纯前端计算，不发任何网络请求，不需要账号。

---

## 安装

需要 DSH（DeepSeek Harness）桌面版或 Web 版。这是一个 **Web 界面插件**，只在有浏览器的 profile（`desktop` / `web`）里有意义。

### 方式一：命令行（推荐）

```bash
dsh plugin --profile desktop add github:OWNER/dsh-plugin-salary-dance
```

把 `desktop` 换成你要装进去的 profile 名，`OWNER` 换成仓库所属账号。

也可以直接用包名从 npm 装（如果你是从 npm 安装的）:

```bash
dsh plugin --profile desktop add dsh-plugin-salary-dance
```

安装完成后：

- **Web 版**：重启一下 `dsh web`。
- **桌面版**：完全退出 DSH 再重新打开（桌面版的 profile 组合在启动时读取，需要一次重启才能挂上新插件）。

### 方式二：Web 界面里安装

侧边栏 **Plugins → Add plugin**，填入：

```
github:OWNER/dsh-plugin-salary-dance
```

安装向导会读取包信息、跑 pnpm、并把 bundle 加进当前 profile。装完同样需要重启一次。

### 安装后确认

侧边栏 **Plugins** 里应该出现 **薪跳 SalaryDance** 卡片；打开 **Settings → Built-in plugins** 的 Plugin list，可以看到 row id `salarydance` 处于 active。界面右上角会出现小卡片。

---

## 使用

| 操作 | 效果 |
| --- | --- |
| 拖动顶部标题栏 | 移动卡片，位置限制在窗口内 |
| 点击「设置 →」 | 打开三步设置面板 |
| 点击步骤标题 `1/2/3` | 直接跳到那一步 |
| 「下一步 / 上一步」 | 在步骤之间切换 |
| 「完成配置，开始使用」 | 关闭面板，回到卡片 |
| 顶部 `×` | 收起面板 |
| 偏好里打开「迷你悬浮模式」后点小卡片 | 展开回完整卡片 |

**改坏了想恢复默认？** 在浏览器里清掉 `localStorage` 的这个键即可：

```
dsh-plugin-salary-dance/config.v1
```

（打开 DSH 页面 → 开发者工具 → Application → Local Storage。）

---

## 计算口径

设上班 `S`、下班 `E`，跨夜时 `E` 归到次日；午休区间 `[L1, L2)` 可选：

- 班次跨度 = `E − S`
- 工作时长 = 班次跨度 − 与班次求交后的午休时长（记 `W`）
- 已工作时长 = `clamp(now, S, E) − S −` 落在已过去的午休部分
- 今日入账 = 日薪 × 已工作时长 ÷ `W`
- 今日预计 = 工作日选中的日子取日薪；休息日只计已实际赚到的部分
- 日薪：
  - 月薪 → 月薪 ÷ 当月按「工作日」筛选出的天数（忽略法定节假日调休）
  - 日薪 → 直接取日薪
  - 时薪 → 时薪 × `W / 60`

跨夜班次下，界面上「已工作 / 距离下班」按同一条时间轴解算，凌晨 02:00 在 22:00→06:00 的班次里读作已工作 4 小时。

---

## 数据保存在哪

| 数据 | 位置 | 说明 |
| --- | --- | --- |
| 薪资模式、金额、工作日、上下班时间、午休、主题与偏好 | 浏览器 `localStorage` 键 `dsh-plugin-salary-dance/config.v1` | 仅存本机，不上传 |
| 卡片位置 | 组件内存 | 刷新页面后回到默认位置 |
| 插件启用状态 | profile 的 `package.json` / `cordis.patch.yml` | 由 `dsh plugin` 或 Web 插件页管理 |

卡片读不到 `localStorage`（被禁用或配额满）时会退回内置默认值，功能不受影响。

---

## 项目结构

```
dsh-plugin-salary-dance/
├── package.json          # bundle 清单：dsh.bundle.patch + dsh.client
├── cordis.patch.yml      # 向 profile 插入 id 为 salarydance 的 Loader row
├── index.js              # Host 半：空实现（整个功能在浏览器侧）
├── client.js             # 浏览器半：卡片 + 设置面板 + 全部计算
├── icon.svg              # 插件管理器卡片图标
├── locale/
│   ├── zh.json           # 插件标题/描述（中文）
│   └── en.json           # 插件标题/描述（英文）
├── test/
│   └── math.test.mjs     # 无浏览器的薪资/工时口径回归测试
├── docs/preview.svg      # README 里那张结构示意图
├── LICENSE
└── README.md
```

### 它是怎么运作的

DSH 把界面插件组织成 **bundle**：一个 npm 包只要在 `package.json` 里声明 `dsh.bundle.patch`，它的 YAML patch 就会被叠加进 profile 的插件树。

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },   // 插入 Loader row
  "client": { "platform": "web", "immediately": true }  // 声明浏览器半 + 启动即载
}
```

- `cordis.patch.yml` 插入一行 `id: salarydance`、`name: dsh-plugin-salary-dance`。
- `index.js` 是 Host 半，导出 `apply()`；这里刻意什么都不做，让 bundle 在没有任何 Web 载体的 Host 上也合法。
- `client.js` 是浏览器半，用 `window.__ModuleLoader__.load({ id, factory })` 注册工厂，`apply(ctx)` 里：
  - `ctx.effect(installStyles)` 注入样式表；
  - `ctx.effect(() => ctx.locale.register(...))` 注册中英文字典；
  - `ctx.slots.inject('shell.overlay', () => ctx.slots.register({...}))` 把组件挂到宿主已声明的浮层插槽上。

因为注册都挂在 `ctx` 的 effect 上，插件被禁用或卸载时样式、字典、插槽注册会一起回收。样式只使用 DSH 主题变量（`--dsw-alias-*`、`--dsw-radius-*`、`--dsw-shadow-*`），不 import 任何 DSH Client 包。

---

## 开发

```bash
git clone https://github.com/OWNER/dsh-plugin-salary-dance.git
cd dsh-plugin-salary-dance

# 口径回归测试（不需要浏览器、无依赖）
npm test

# 链接进你的 profile 调试
dsh plugin --profile desktop add "$PWD"
```

改完 `client.js` 后：

- 若宿主开着 HMR，刷新页面即可拿到新 bundle（bundle 版本号按文件 mtime/size 计算）。
- 否则重启 `dsh web` / 桌面版。

仓库刻意不引入构建步骤：`client.js` 就是产物，纯 JS + `React.createElement`，没有 JSX、没有打包器、没有运行时依赖，改一行刷新就能看到效果。

---

## 兼容性

| 项 | 值 |
| --- | --- |
| 类型 | DSH Web 界面插件（bundle） |
| 适用 profile | `desktop`、`web` 等带浏览器载体的 profile |
| 不适用 | `tui`、`headless` 等无浏览器载体的 profile（Host 半合法但不会有界面） |
| DSH 版本 | 在 `0.2.0-rc.2` 上开发与验证 |
| Cordis | `~4.0.4` |
| 运行时依赖 | 无 |
| 网络 | 不使用 |

`client.js` 只用两样宿主能力：插槽服务与 locale 服务（在 `inject = ['slots', 'locale']` 里声明）。两者都缺失时插件不会挂载，而不是抛错。

---

## 已知限制

- 今日预计按 **工作日** 判断，不考虑法定节假日与调休。
- 卡片位置不持久化，刷新后回到右上角。
- 「开机自动启动」是界面偏好：插件的挂载时机由 DSH 进程决定，本插件无法自行拉起进程。
- 月薪按当月工作日摊算，月内天数不同的月份日薪会略有差异，这是刻意设计（和参考稿一致）。

---

## License

[MIT](LICENSE)
