# AGENTS.md

本文件面向在 EasyNote 仓库中工作的 AI / 人类协作者。动手前先读本文件；产品与架构细节以 `docs/` 为准，本文件负责执行规则。

## 1. 项目定位

EasyNote 是本地优先的 Markdown 笔记桌面应用：Electron 45 + Vue 3 + TypeScript，Tiptap 编辑，SQLite（FTS5）索引；正文以 Markdown 文件落盘，索引存于库内 `.easynote/index.db`。单 package、单体模块化，不做 monorepo、微服务或运行时插件。

## 2. 权威文档

| 文档 | 内容 |
| --- | --- |
| `docs/PRD.md` | 产品范围、功能与验收标准 |
| `docs/技术栈.md` | 技术与版本基线 |
| `docs/ui设计规范.md` | 视觉、布局、交互与文案规范 |
| `docs/项目目录.md` | 目录、模块边界、依赖规则（最详细，冲突时优先） |

## 3. 环境与命令

Node.js 24 / npm。脚本名在 `docs/项目目录.md` §11.2 已确定；创建脚手架时必须沿用：

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装依赖 |
| `npm run dev` | 启动开发环境 |
| `npm run build` | 构建安装包资源 |
| `npm run typecheck` | 主进程 + 渲染进程类型检查 |
| `npm run test` | 单元 / 集成测试 |
| `npm run test:e2e` | Electron 端到端测试 |
| `npm run check` | `typecheck` + 边界检查 + `test` |

> 当前仓库尚无 `package.json` 与 `src/`；脚本在脚手架落地后生效。此前的文档类任务无需运行它们。

## 4. 架构硬约束

- `src/main`、`src/preload`、`src/renderer`、`src/shared` 是硬边界，禁止跨进程直接 import 运行时代码。
- 每个 feature module 只在根目录暴露一个 `index.ts`；其他模块只能 import 该入口，禁止深入 `domain/`、`application/`、`infrastructure/`、`ipc/`、`components/`、`stores/`、`composables/`。
- 主进程模块只写自己的表；跨模块读取走对方 public service。表归属见 `docs/项目目录.md` §3.3。
- 业务模块不直接 import `node:fs`、`better-sqlite3`、`chokidar`，统一通过 `MainContext` 注入的平台端口。
- 渲染进程禁止 import `electron`、`node:*`、`better-sqlite3`、`chokidar`；只能通过 `window.easynote` / `RendererContext.api` 调用主进程。
- `preload` 只做白名单桥接与事件订阅，不含业务判断。
- `src/shared` 只放契约、DTO、纯类型、纯函数，不 import Electron / Node，不放业务实现。
- 不新增 `src/utils`、`src/common`、`src/services` 大杂烩目录。
- 路径别名只用 `@shared/*`、`@main/*`、`@preload/*`、`@renderer/*`，不用 `@/*`。
- 新增模块只改组合根（`bootstrap/modules.ts`、`renderer/app/modules.ts`、`preload/api/index.ts`）与契约，不改已有模块内部。

## 5. 编码约定

- 文件名 kebab-case；Vue 组件 PascalCase；composable 用 `use` 前缀；store 用 `<module>-store.ts`。
- IPC 通道 `<module>:<action>`；事件 `<module>:<event>`；错误码 `<MODULE>_<REASON>`。
- 所有 IPC 返回 `IpcResult<T>`，错误用错误码，不抛裸异常。
- DTO 必须可结构化克隆：普通对象 / 数组 / 原始值 / ISO 字符串，不放类实例、函数、`Map`、`Set`。
- UI 文案集中在 `renderer/i18n/zh-CN.ts`；颜色、间距使用 `styles/tokens.css` 变量，不写死色值。
- 测试放 `tests/main/modules/<module>/`、`tests/renderer/modules/<module>/`，测行为与边界，不测纯转发。
- 删除死代码，不保留兼容 shim；不引入 PRD 之外的入口或依赖。

## 6. 任务完成流程

1. 读 `docs/` 中相关章节与现有代码，确认模块归属和边界。
2. 只做任务要求的改动，复用现有模式，不顺手扩大范围。
3. 验证：优先运行覆盖改动的窄范围检查；脚手架就绪后至少运行 `npm run check`。
4. 验证通过后按 §7 立即提交 Git；验证失败不得提交，先修复或如实报告阻塞。
5. 汇报结果：改了什么、如何验证、提交哈希。

## 7. Git 提交要求（MUST）

**每完成一个任务（功能、修复、重构、测试、文档、配置）且验证通过后，必须立即提交一次 Git，不得把多个任务积压到同一次提交。**

### 7.1 提交前

```bash
git status --short
git diff --stat
```

- 只暂存本任务相关文件，逐路径 `git add <path>`；禁止用 `git add -A` 代替审查。
- 确认没有混入无关格式化、调试输出、临时文件。
- 不得提交：`node_modules/`、`dist/`、`out/`、`release/`、`coverage/`、`.easynote/`、日志、密钥、`.env`、用户库内容。
- 钩子或检查失败时修复问题，禁止 `--no-verify` 绕过。

### 7.2 提交信息

采用 Conventional Commits，摘要用中文、动词开头、不超过 50 字：

```
<type>(<scope>): <摘要>

<可选：动机与影响>
<可选：验证方式>
```

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `refactor` | 不改变行为的重构 |
| `perf` | 性能优化 |
| `test` | 测试 |
| `docs` | 文档 |
| `build` | 构建 / 依赖 |
| `ci` | CI 配置 |
| `chore` | 其他维护 |

`scope` 用模块或目录名（`note`、`editor`、`indexer`、`docs`、`repo` 等）。示例：

```
feat(note): 增加重命名标题冲突处理
fix(indexer): 避免 watcher 重建时重复入队
docs(agents): 明确目录图谱与提交规则
chore(repo): 初始化仓库并纳入项目文档
```

### 7.3 提交后

```bash
git log -1 --oneline
```

- 在结果中报告提交哈希与摘要。
- 一个任务一个提交；用户明确要求不提交时，遵从用户。
- 不修改已推送提交的历史；需要补充时追加新提交。

## 8. 文件目录图谱

当前仓库仅有 `docs/`、`AGENTS.md` 与 `.gitignore`；`src/`、`tests/`、`scripts/` 等按下列目标结构随开发创建。

```
easynote/
├─ AGENTS.md                       # 协作规则 + 目录图谱
├─ docs/
│  ├─ PRD.md                       # 产品需求
│  ├─ 技术栈.md                    # 版本基线
│  ├─ ui设计规范.md                # 视觉与交互规范
│  └─ 项目目录.md                  # 目录与模块边界详规
├─ src/
│  ├─ main/                        # Electron 主进程
│  │  ├─ index.ts                  # 进程入口
│  │  ├─ app/                      # 窗口、菜单、安全、窗口状态
│  │  ├─ bootstrap/                # context / modules / migrations / ipc / lifecycle
│  │  ├─ platform/                 # fs sqlite watcher trash dialog theme logger
│  │  └─ modules/                  # vault folder note indexer block link tag search graph settings window
│  ├─ preload/                     # 白名单 API 桥接
│  │  ├─ index.ts
│  │  └─ api/                      # 每模块一个文件 + index.ts 汇总
│  ├─ renderer/                    # Vue 3 渲染进程
│  │  ├─ main.ts
│  │  ├─ App.vue
│  │  ├─ app/                      # bootstrap / modules / api / providers / shortcuts
│  │  ├─ modules/                  # shell explorer editor tags search backlinks outline graph settings quick-switch
│  │  ├─ ui/                       # Base* 通用组件 + icons
│  │  ├─ styles/                   # tokens / base / themes
│  │  └─ i18n/
│  └─ shared/                      # 跨进程契约、类型、纯函数
│     ├─ contracts/                # api / envelope / events / errors / <module>
│     ├─ types/                    # brand / result
│     └─ utils/                    # text / date
├─ tests/
│  ├─ main/modules/                # 主进程模块测试
│  ├─ renderer/modules/            # 渲染模块测试
│  ├─ e2e/                         # 启动、编辑、双链、搜索、主题、窗口
│  ├─ fixtures/                    # vaults / markdown
│  └─ helpers/                     # 临时目录、SQLite、mock API
├─ resources/icons/                # 打包图标，不放用户内容
├─ scripts/                        # check-boundaries.mjs / seed-vault.ts
├─ package.json                    # 待创建
├─ electron.vite.config.ts         # 待创建
├─ electron-builder.yml            # 待创建
├─ tsconfig*.json                  # 待创建
└─ .gitignore
```

目录职责速查：

| 路径 | 职责 | 禁止 |
| --- | --- | --- |
| `src/main` | 窗口、文件、SQLite、索引、监听、回收站、系统主题 | 渲染 UI、读渲染进程状态 |
| `src/preload` | 白名单 API、事件订阅 | 业务逻辑、直接读写库 / 文件 |
| `src/renderer` | Vue UI、Tiptap、KaTeX、Canvas 图谱 | import Electron / Node / SQLite |
| `src/shared` | IPC 契约、DTO、事件、错误码、纯函数 | 业务实现、进程相关 API |
| `tests` | 与源码模块一一对应的测试 | 触碰用户真实库 |
| `scripts` | 边界检查、示例库生成 | 放业务逻辑 |

## 9. 图谱维护

新增或删除顶层目录、feature module、组合根文件时，必须在**同一个提交**中更新本节图谱与 `docs/项目目录.md`，避免文档与代码漂移。
