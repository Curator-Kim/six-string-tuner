# 弦准 · Six String

一个在浏览器中运行的六弦吉他调音 APP。音频在本机处理，不会上传或保存。

## 功能

- 自动识别标准调弦中最近的琴弦：E2、A2、D3、G3、B3、E4。
- 手动点击琴头上的六个琴钮选弦。点击琴钮会切换到手动模式。
- 显示实测 / 目标频率、音分差和音准指针；±5 音分判定为准确。
- 偏低提示拧紧琴弦，偏高提示放松琴弦。
- 播放六根琴弦的标准音，播放时暂停分析以避免误识别。
- A4 基准音可在 420–460 Hz 调整并保存在本地。
- 麦克风权限、设备断连与静音状态处理；页面进入后台后释放麦克风。
- 适配桌面和手机浏览器，支持键盘操作。

## 运行

需要 Node.js 20 或更新版本。

```sh
npm install
npm run dev
```

打开终端显示的 localhost 地址，点击“开启麦克风”，允许麦克风访问后，逐根拨动空弦。手动模式下，先点击正在调节的琴钮。

```sh
npm test
npm run build
npm run preview
```

`dist/` 为生产构建，可部署到支持 HTTPS 的静态服务器。手机访问远程部署需要 HTTPS；普通局域网 HTTP 地址通常无法使用麦克风。

## 实现与限制

使用 Web Audio API 和 [Pitchy](https://github.com/ianprime0509/pitchy) 的 McLeod 音高检测，结合清晰度 / 音量阈值和五帧中位数稳定读数。以 `1200 × log2(实测频率 / 目标频率)` 计算音分。

一次只拨动一根弦，尽量减弱其他琴弦共振与背景噪声。自动模式依据最近的标准音选择琴弦；严重跑调、强泛音或非标准调弦时，可能匹配到其他弦，建议改用手动选弦。支持 55–450 Hz 的有效输入。

项目同时提供浏览器版本和可安装的 Android APP。Android 版本通过 Capacitor 将界面与调音资源打包到本地，安装后无需电脑服务或网络；最低系统为 Android 8.0。音频权限及设备质量会影响实际表现。

## Android 安装包

生成的安装包位于 `releases/six-string-tuner-v1.0.0.apk`。将 APK 传到安卓手机后打开，允许该文件来源安装应用；首次调音时允许麦克风权限。应用名称为“弦准”，包名为 `com.curatorkim.sixstringtuner`。

这是使用开发签名的可安装测试版，不是应用商店发行版。发布到商店前需使用自己的正式签名；签名密钥与 APK 产物不提交到源码仓库。测试版更新请使用同一开发签名构建。

Windows 构建需要 Node.js 20+、JDK 21、Android SDK 平台 / Build Tools 35。安装依赖后运行：

```powershell
./scripts/build-android.ps1 -JdkPath '你的 JDK 21 路径' -AndroidSdkPath '你的 Android SDK 路径'
```

脚本会执行前端构建、Android 同步和 Gradle 构建，并复制 APK 到 `releases/`。也可以在 Android Studio 中打开 `android/` 工程。构建缓存放在忽略的 `.tools/gradle/`，不会改动系统 Java 配置。

`scripts/verify-android.mjs` 用于专用的 `emulator-5554` 测试模拟器：先安装 debug APK，再运行 `node scripts/verify-android.mjs`。它会重置该测试应用的麦克风权限，验证系统授权、真实采集启动、合成信号的音准反馈和断网启动；结束时测试模拟器的 Wi-Fi / 数据网络处于关闭状态。不要将它用于日常手机。安装与授权已在 Android 15 模拟器上验证，实体吉他的拾音效果仍需实机测试。

## 验证

`npm test` 覆盖六根弦在 44.1 / 48 kHz 采样率下的合成基音与泛音、±30 音分的高低判断、E2 / E4 区分、校准与静音。

安装 Chrome 后，可以运行 `npm run build` 和 `npm run test:ui`。界面验证使用生产构建和合成麦克风信号，覆盖 320–1440px 布局、琴头渲染、选弦、自动与手动音准反馈、校准保存、标准音播放、静音、权限拒绝及麦克风释放。截图保存在忽略的 `.tools/screenshots/` 中。真实吉他与实体麦克风的效果需要实际拨弦验证。

## 版本管理

通过 Git 管理源码。依赖目录、构建产物和开发工具缓存均已忽略；项目不包含账号密钥。
