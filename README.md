# PT Checkmate

一个本地 Chrome 扩展，用来定期打开你配置的 PT 站点，并在页面里尝试点击常见签到按钮。它不保存账号密码，只复用你 Chrome 里已经存在的登录状态。

## 适合什么场景

- 有多个 PT 站点，需要定期登录，怕超过站点的活跃周期
- 想要一个本地、一键、可定时的巡检工具
- 希望避免把账号密码交给第三方服务或云端脚本

## 它怎么工作

- 打开你配置的站点首页或签到页
- 使用 Chrome 现有 cookie/session 判断登录状态
- 如果页面已经登录，尝试按关键词或 CSS 选择器点击签到按钮
- 如果页面出现密码框，只记录“需要手动登录”，不会保存或填写密码
- 默认每 21 天上午 11:00 巡检一次
- 如果电脑或 Chrome 当时没开，下次 Chrome 启动后会自动补跑一次

## 安装

### 方式一：下载发布包

1. 打开 [Releases](https://github.com/Lau0x/pt-checkmate/releases/latest)
2. 下载 `pt-checkmate-v0.1.1.zip`
3. 解压这个 zip 文件
4. 打开 Chrome，进入 `chrome://extensions`
5. 开启右上角「开发者模式」
6. 点击「加载已解压的扩展程序」
7. 选择解压后的 `pt-checkmate` 文件夹
8. 打开扩展设置页，填写站点并点击「保存并授权」

### 方式二：从源码加载

```bash
git clone https://github.com/Lau0x/pt-checkmate.git
```

然后在 Chrome 的 `chrome://extensions` 页面里加载这个仓库目录。

## 打开设置页

安装后有三种入口：

1. 点击浏览器工具栏里的 PT Checkmate 图标，再点「设置」
2. 在 `chrome://extensions` 找到 PT Checkmate，点击「详情」，再点「扩展程序选项」
3. 直接打开扩展设置页地址：`chrome-extension://扩展ID/options.html`

扩展 ID 可以在 `chrome://extensions` 里看到。不同用户本地安装生成的 ID 可能不同。

## 浏览器兼容

主要支持 Chrome 和 Chromium 内核浏览器，例如 Edge、Brave、Arc。Firefox 没有作为当前目标浏览器测试。

## 配置项

### 全局设置

- 定时巡检：是否自动运行
- 间隔天数：默认 `21`，建议小于站点要求的最长未登录天数
- 巡检时间：默认 `11:00`，按本机 Chrome 的本地时间执行
- 巡检后关闭标签页：默认关闭，避免留下很多标签页
- 打开标签页：默认后台打开

### 站点设置

- 站点名称：方便识别
- 首页 URL：必填，例如 `https://example.com/`
- 签到页 URL：可选；留空则打开首页
- 等待秒数：页面加载后等待多久再找按钮
- 按钮关键词：每行一个，例如 `签到`、`每日签到`、`check in`
- CSS 选择器：可选；适合站点按钮文字不稳定时使用，例如 `button.checkin`

## 隐私与安全

- 不保存账号
- 不保存密码
- 不读取浏览器密码管理器
- 不上传任何数据
- 不包含统计、遥测或远程接口
- 站点配置只保存在本机 Chrome 的扩展存储里
- 仅向你配置过的站点请求访问权限

## 注意事项

- Chrome 扩展无法在电脑关机、Chrome 未启动时运行
- 如果错过巡检时间，扩展会在下次 Chrome 启动时补跑
- 如果站点登录态过期，需要你手动登录一次
- 不同站点页面结构不同，自动点击签到不保证 100% 成功
- 请遵守对应站点规则，谨慎使用自动化功能

## 本地开发

这个扩展不需要构建步骤，源码可以直接作为未打包扩展加载。

```bash
node --check src/background.js
node --check src/options.js
node --check src/popup.js
```

## 许可证

MIT
