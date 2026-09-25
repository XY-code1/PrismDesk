# PrismDesk

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md)

PrismDesk 是一个面向 Windows 11 的开源桌面外观工具，用同一套本地图片或原创极光动画分别装饰 Codex 桌面版与 WorkBuddy。项目完全在本机工作，不提供账号、云端服务、付费功能或主题商城。

> PrismDesk 是独立社区项目，与 OpenAI、腾讯及其产品不存在隶属、授权或背书关系。

![PrismDesk 桌宠与设置窗口](docs/screenshots/pet-and-settings.png)

## 当前状态

当前版本为 **`0.1.0-alpha.1`**，目标平台为 Windows 11 x64。

| 客户端 | 实测版本 | 当前结果 |
|---|---:|---|
| Codex 桌面版 | 26.917.9434.0 | 图片、极光、重复应用、恢复通过 |
| WorkBuddy | 5.5.3.0 | 图片、极光、重复应用、暂停、恢复通过 |

精确范围和未验证项目见 [兼容性列表](docs/COMPATIBILITY.md) 与 [测试记录](docs/TEST_RECORD.md)。

## 功能

- 检测 Codex、WorkBuddy 的安装、版本、进程、连接与适配状态。
- 导入本地 PNG、JPEG、WebP 图片，以及不依赖远程素材的 Canvas 极光动画。
- 调节亮度、透明度、模糊、动画速度及 15/30/60 FPS。
- 分别向两个客户端应用同一主题，暂停动画或恢复默认外观。
- 幂等注入：重复应用不会叠加背景节点或动画循环。
- 恢复时只删除 PrismDesk 创建的节点、样式和监听器。
- 主题配置严格校验，不执行主题脚本；设置和背景资源仅保存在本地。
- 原创透明桌宠 Prism：单击打开设置、拖动定位、透明区域鼠标穿透、位置跨重启保存。
- 关闭设置窗口后驻留系统托盘，可重新打开或完整退出。

## 工作方式与安全边界

PrismDesk 不修改客户端安装文件、`app.asar`、签名或完整性数据。适配器只连接由指定客户端拥有的本机回环 CDP 端口，并验证客户端专属主渲染页：

- Codex：`127.0.0.1:9222`，精确目标 `app://-/index.html`。
- WorkBuddy：`127.0.0.1:9223`，目标包含 `renderer/index.html`。

当客户端正在运行但没有开启 CDP 时，PrismDesk 不会自动重启它，以避免中断任务。连接和诊断不会读取聊天正文或账号凭据，日志也不记录页面正文。

## 环境与技术栈

- Windows 11 x64、Node.js 22+
- Electron 38、TypeScript 5
- 原生 HTML/CSS/DOM（未使用 React）
- esbuild（未使用 Vite）、electron-builder

## 本地开发

```powershell
git clone https://github.com/XY-code1/PrismDesk.git
cd PrismDesk
npm install
npm run check
npm test
npm run dev
```

`npm run dev` 会先用 esbuild 构建主进程、预加载脚本和渲染器，然后启动 Electron。

## Windows 打包

```powershell
npm run package:win
```

打包命令不会跳过检查或测试，会依次运行类型检查、测试、构建以及 NSIS/Portable 打包。产物位于 `release/`：

- `PrismDesk-Setup-0.1.0-alpha.1-x64.exe`
- `PrismDesk-Portable-0.1.0-alpha.1-x64.exe`

项目配置了 Electron 下载镜像与重试，依赖版本仍由 `package-lock.json` 锁定。`release/` 已被 Git 忽略，安装包不会随源码提交。

## 使用

1. 启动 PrismDesk，查看两个客户端的检测状态。
2. 如果目标客户端尚未运行，点击“连接”。
3. 如果客户端已运行但显示需要重启，请保存任务、手动退出客户端，再点击“连接”。Codex 也可运行 `Start-Codex-for-PrismDesk.cmd`。
4. 选择“极光”或导入本地图片，调整参数，然后在目标客户端卡片上点击“应用”。
5. 点击“恢复默认”清理当前会话中的 PrismDesk 注入。

## 桌面小宠物

![Prism 桌宠](docs/screenshots/pet-character.png)

- 单击 Prism 打开或聚焦设置窗口；按住角色可拖动。
- 位置保存在 Electron `userData/pet.json`，显示器变化后会重新约束到可见区域。
- 只有角色不透明区域接收鼠标，其余透明区域点击穿透。
- 关闭设置窗口只会隐藏窗口；从托盘菜单选择“退出 PrismDesk”才会完全退出。

## 配置与卸载

主题配置位于 Electron `userData/themes/config.json`，导入图片复制到同一 `themes` 目录的 `assets/` 中。卸载前建议先为每个已连接客户端执行“恢复默认”。如需删除保留配置，可手动删除 `%APPDATA%\PrismDesk`。

## 已知限制

- 背景注入是会话级的，客户端重启后需要重新应用。
- 客户端更新可能改变 DOM；PrismDesk 会停止未知结构的适配，而不是盲目注入。
- 输入、代码复制、长页面滚动、全部弹窗以及干净系统上的升级/卸载仍属于人工发布检查项目。
- 当前测试构建未进行商业代码签名，并使用默认 Electron 应用图标。

## 文档

[架构](docs/ARCHITECTURE.md) · [兼容性](docs/COMPATIBILITY.md) · [测试记录](docs/TEST_RECORD.md) · [适配研究](docs/RESEARCH.md) · [演示流程](docs/DEMO.md) · [贡献指南](CONTRIBUTING.md) · [第三方声明](THIRD_PARTY_NOTICES.md)

## 多语言与贡献

README 提供简体中文、英语、日语、韩语和西班牙语。翻译必须以实际功能为准，不能把未实测兼容性写成“已支持”。欢迎按 [CONTRIBUTING.md](CONTRIBUTING.md) 提交修正或新增语言。

## License

原创代码使用 [MIT License](LICENSE)。第三方内容继续遵循各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
