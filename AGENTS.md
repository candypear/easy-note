# AGENTS.md

EasyNote 仓库路径导航。本文件只维护路径索引；规范正文按下列入口查阅。

## 1. 规范入口

| 路径 | 内容 | 何时查阅 |
| --- | --- | --- |
| `docs/PRD.md` | 产品范围、功能、验收标准 | 确认需求与边界 |
| `docs/技术栈.md` | 技术选型与版本基线 | 增删依赖、升级版本 |
| `docs/ui设计规范.md` | 视觉、布局、交互、文案 | 开发或调整界面 |
| `docs/项目目录.md` | 目录结构、模块边界、依赖规则、命名、测试、脚本 | 新增模块、改动跨模块代码 |
| `docs/git规范.md` | 任务完成后的提交流程与提交信息格式 | 每次完成任务、提交前 |

## 2. 目录图谱

当前仓库仅有 `docs/`、`AGENTS.md` 与 `.gitignore`；`src/`、`tests/`、`scripts/` 等按下列目标结构随开发创建。

```
easynote/
├─ AGENTS.md                       # 路径索引（本文件）
├─ docs/
│  ├─ PRD.md                       # 产品需求
│  ├─ 技术栈.md                    # 版本基线
│  ├─ ui设计规范.md                # 视觉与交互规范
│  ├─ 项目目录.md                  # 目录与模块边界详规
│  └─ git规范.md                   # Git 提交规范
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
├─ resources/icons/                # 打包图标
├─ scripts/                        # check-boundaries.mjs / seed-vault.ts
├─ package.json                    # 待创建
├─ electron.vite.config.ts         # 待创建
├─ electron-builder.yml            # 待创建
├─ tsconfig*.json                  # 待创建
└─ .gitignore
```

## 3. 组合根入口

新增或改动模块时涉及的注册文件：

| 路径 | 作用 |
| --- | --- |
| `src/main/bootstrap/modules.ts` | 主进程模块实例化与装配 |
| `src/main/bootstrap/migrations.ts` | 汇总各模块迁移 |
| `src/main/bootstrap/ipc.ts` | 汇总注册 IPC handler |
| `src/preload/api/index.ts` | 汇总 `EasyNoteApi` |
| `src/renderer/app/modules.ts` | 注册渲染模块 |
| `src/renderer/app/bootstrap.ts` | 渲染进程启动流程 |
