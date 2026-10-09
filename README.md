<p align="center">
  <img src="assets/edge-type-paste-logo-300x300.png" alt="逐字输入 Logo" width="132" height="132">
</p>

<h1 align="center">逐字输入</h1>
<p align="center">将你剪贴板的内容逐字输出以模仿正常键盘输入</p>
<p align="center"><strong>Microsoft Edge · Manifest V3 · v0.3.7</strong></p>

---

## 从 Edge 商店直接安装

[Edge 插件链接（可以直接安装）](https://microsoftedge.microsoft.com/addons/detail/%E9%80%90%E5%AD%97%E8%BE%93%E5%85%A5/pdfhldjpbbigiccdgopnecenejjpjgpa)

## 项目简介

“逐字输入”是一款 Microsoft Edge 侧边栏扩展。用户在侧边栏中输入或粘贴文字，选择网页输入框后，扩展逐字符发送输入事件。它不调用目标网页的粘贴操作，适用于粘贴受限、但网站规则仍允许键盘输入的场景。

> 请先确认目标网站允许使用此类输入方式。扩展不会替用户提交表单；提交前请检查网页中的实际内容。

## 功能

| 功能 | 说明 |
| --- | --- |
| 常驻侧边栏 | 打开网页输入框时，侧边栏保持显示。 |
| 文字输入 | 可在侧边栏键入文字，也可由用户使用浏览器粘贴到侧边栏。 |
| 多种编辑区域 | 支持常见单行、多行文本框和可编辑区域。 |
| 输入速度 | 每字符间隔可设为 0–500 毫秒，默认 0 毫秒。 |
| 多语言字符 | 支持中文、英文、数字和常见 Unicode 字符。 |
| 自动缩进适配 | 尝试处理 Monaco、CodeMirror、Ace 等编辑器的自动缩进，减少重复的行首空格。 |

## 快速开始

### 在 Edge 中安装

1. 打开 `edge://extensions`，启用“开发人员模式”。
2. 选择“加载解压缩的扩展”，再选择本项目根目录（其中包含 `manifest.json`）。
3. 固定“逐字输入”图标，点击图标打开侧边栏。

### 输入文字

1. 在侧边栏文字框中键入文字，或使用 `Ctrl+V` 将文字粘贴到侧边栏。
2. 设置“每字符间隔（毫秒）”；`0` 表示不额外等待。
3. 点击“等待选择网页输入框”，再点击网页中的目标输入框。选中后会自动开始输入。
4. 如果目标输入框已经选中，可点击“输入到已选输入框”。
5. 核对网页内容，再由你决定是否提交表单。

输入完成后，扩展会断开调试连接。Edge 可能在输入期间显示扩展正在调试当前标签页的提示，这是 `debugger` 权限发送输入事件时的浏览器提示。

## 隐私与数据

- 扩展不调用剪贴板读取接口；侧边栏中的粘贴由用户通过浏览器操作完成。
- 侧边栏草稿和目标输入框标识暂存在 `chrome.storage.session`，不会发送到外部服务器。
- 内容脚本按 Manifest 设置在网页和框架中运行，用于跟踪焦点输入框与光标；自动缩进适配会检查目标光标所在行的空格或制表符。
- 扩展不自动提交表单，也不加载远程脚本。
- 点击“清空侧边栏文字”可删除草稿；标签页导航或关闭时会清理对应的目标标识。

## 权限说明

| 权限 | 使用目的 |
| --- | --- |
| `storage` | 暂存侧边栏草稿和目标输入框标识。 |
| `tabs` | 定位当前活动标签页、发送输入请求并清理临时状态。 |
| `debugger` | 通过 `Input.dispatchKeyEvent` 和 `Input.insertText` 向选定输入框发送文字；输入结束后断开。 |
| `sidePanel` | 显示在切换网页时保持打开的侧边栏。 |
| `scripting` | 用户启动功能时，将扩展内的内容脚本注入当前标签页及其框架。 |
| `<all_urls>` | 支持用户在任意普通网站中选择输入框；内容脚本会在匹配页面跟踪编辑框焦点。 |

`<all_urls>` 和 `debugger` 权限范围较广。提交 Edge Add-ons 时，发布者需要在 Partner Center 中如实解释用途；是否通过审核由 Microsoft 决定。

## Edge Add-ons 上传材料

- **扩展包：** [`dist/edge-type-paste-v0.3.7.zip`](dist/edge-type-paste-v0.3.7.zip)
- **300×300 Logo：** [`assets/edge-type-paste-logo-300x300.png`](assets/edge-type-paste-logo-300x300.png)
- **中文 Description 与 Privacy 文案：** [`store-listing/zh-CN.md`](store-listing/zh-CN.md)

## 限制

浏览器内部页面（例如 `edge://` 页面）、Edge Add-ons 商店页面及部分受限页面不允许扩展注入。网页若禁止键盘输入、使用特殊编辑器校验或主动拒绝输入，扩展也可能无法工作。发送完成提示只表示输入命令已发出，请检查网页实际内容。

