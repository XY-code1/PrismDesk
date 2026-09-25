# PrismDesk

PrismDesk 是一个面向 Windows 11 的开源桌面背景工具，可用同一套本地图片或原创极光动画分别装饰 Codex 桌面版和 WorkBuddy。它是独立社区项目，不隶属于 OpenAI 或腾讯。

## 功能

- 自动检测安装、版本、运行与适配状态
- PNG/JPG/WebP 本地导入，纯 Canvas 极光动画
- 亮度、透明度、模糊、速度、15/30/60 FPS、动态关闭
- 每个客户端独立应用与恢复；注入幂等且清理范围仅限 PrismDesk
- 配置保存到 Electron `userData/themes/config.json`
- 严格声明式主题 JSON：拒绝未知字段和任意脚本
- 桌面小宠物入口：透明无边框小窗口，单击角色打开设置，拖动角色移动，位置跨重启记忆
- 关闭设置窗口后驻留系统托盘，托盘菜单提供“打开设置”和“退出 PrismDesk”

## 启动与构建

要求 Node.js 22+，Windows 11。

```powershell
npm install
npm test
npm run dev
npm run package:win
```

安装包输出到 `release/`：`PrismDesk-Setup-0.1.0-x64.exe` 为安装版，`PrismDesk-Portable-0.1.0-x64.exe` 为便携版。卸载 PrismDesk 不会修改客户端；若卸载前仍已注入，请先在每个已连接客户端点击“恢复默认”。配置默认保留，手动删除 `%APPDATA%\PrismDesk` 可彻底清理。

## 使用

1. 客户端未运行时点击“连接”，PrismDesk 会以仅监听 `127.0.0.1` 的 CDP 参数启动它。
2. 如果客户端已经运行但未开启 CDP，PrismDesk 不会重启它；先保存工作并手动退出客户端，再点击“连接”。
3. 选择极光或导入图片，调节参数，点击对应客户端的“应用”。
4. 点击“恢复默认”只移除 PrismDesk 创建的 DOM、样式、监听器和动画帧。

## 桌面小宠物

启动后右下角会出现 PrismDesk 自己的原创角色 Prism（透明背景，只显示角色本身）：

![桌宠角色](docs/screenshots/pet-character.png)

1. **单击角色**打开设置窗口；设置窗口已经打开时会把它切到前台。
2. **按住角色拖动**可以把它放到任意位置，位置写入 `userData/pet.json`，重启后恢复；多显示器或分辨率变化后会重新约束到可见工作区内。
3. 角色的**透明区域不接收鼠标**：只有角色剪影范围会拦截点击，其余部分直接穿透到桌面上的其他窗口。
4. **关闭设置窗口**只是收进系统托盘（窗口隐藏、保留未保存的表单内容），此时桌宠仍在桌面。
5. **托盘图标**（PrismDesk 宝石）右键菜单：`打开设置`、`退出 PrismDesk`。退出时会先销毁桌宠窗口与托盘图标再退出。

![桌宠与设置窗口](docs/screenshots/pet-and-settings.png)

当前兼容性和安全边界见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)，架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## License

原创代码 MIT；第三方组件与研究参考按各自许可证处理，详见 `THIRD_PARTY_NOTICES.md`。
