# 程序员的情书

一个可以直接托管在 GitHub Pages 上的纯静态页面。

左边是写给你的誓言，右边是两个人一起走过的时间轴；重大日子、照片、还没到来的纪念日，都排在一条线上。

- 纯 HTML + CSS + 原生 JavaScript，**零依赖、零构建**
- 所有内容只存在一个文件里：`data/content.json`
- 自带浏览器内编辑器：改文字、加照片、改日期、切配色，改完导出 JSON 提交即可上线

![桌面端](assets/preview.jpg)

<img src="assets/preview-mobile.jpg" width="300" alt="移动端">

---

## 本地预览

浏览器不允许 `file://` 页面读取本地 JSON，所以要起一个静态服务器。

### 最省事的方式：双击 `preview.bat`

它会自己切到项目目录、挑一个没被占用的端口（8000 起）、打开浏览器，按下 `Ctrl + C` 或者关掉窗口就停止。

### 手动方式

```bash
# 先确认自己在这个项目目录里（路径里有空格，记得带引号）
cd "D:\dsh_workspace\02 love letter"

# 任选一种
python -m http.server 8000
py -3 -m http.server 8000
npx serve .
```

然后打开 <http://127.0.0.1:8000>。

> 直接双击 `index.html` 会看到「信纸没找到」，是正常现象。

**打不开时按顺序排查：**

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 打开后是一堆文件名列表 | 命令跑在了上一级目录 | 先 `cd` 进项目目录再启动 |
| 命令没反应 / 弹微软商店 | `python` 指向了 Windows 的应用商店占位程序 | 改用 `py -3 -m http.server 8000` |
| `Address already in use` / `只有一次机会` | 8000 端口被别的程序占了 | 换端口：`python -m http.server 8080` |
| 浏览器提示无法访问 / 连接被拒绝 | 代理、VPN 把 `localhost` 也转发了 | 用 `127.0.0.1` 别用 `localhost`，或在代理里放行本地地址 |
| 页面能开但白屏、控制台报错 | 之前存了坏草稿 | 页面右下角「编辑 → 发布 → 丢弃草稿」 |

---

## 怎么改内容

### 方式一：在页面里改（推荐）

1. 点右下角的「编辑」（或按 `Ctrl` / `⌘` + `E`）
2. 三个标签页：
   - **情书**：名字、在一起的日期、城市、配色、誓言的标题与正文
   - **时间轴**：增删改每一条记录、上传照片、开关「自动纪念日」
   - **发布**：导出 / 导入 JSON、换封面图、丢弃草稿
3. 改完点「完成」，右栏时间轴会立刻更新

**怎么删掉一条记录**

- 手写的记录：时间轴标签页 → 点开那一条 → 「删除这一条」→ 再点一次「删除」确认。
  删完底部会出现「已删除 · 撤销」，7 秒内点撤销就能还原。
- 自动生成的纪念日（金色那张）：在「自动纪念日」下面找到它 → 「隐藏」。
  隐藏的会变灰，点「恢复」就又回来了。当天已经有手写记录的会自动标出来，不用管。

> 删除是两步确认，不会点一下就没了；但确认之后只在本地草稿里，导出并提交才会影响线上。

改动会先存在**这台设备的浏览器**里（localStorage），刷新不丢，但**不会同步到线上**。

想让别人也看到：

1. 「发布」→「导出 content.json」
2. 用导出的文件替换仓库里的 `data/content.json`
3. 提交、推送，GitHub Pages 会自动重新发布

编辑器里的「丢弃草稿」会清掉本地改动、回到仓库里的版本。

### 方式二：直接改 `data/content.json`

```jsonc
{
  "couple": {
    "from": "阿远",              // 你的名字
    "to": "小满",                // 对方的名字
    "startDate": "2024-05-20",   // 在一起的日期，所有天数、周年都从这天算
    "place": "杭州"              // 城市，显示在标题下面，可留空
  },
  "vows": {
    "eyebrow": "A LOVE LETTER, WRITTEN IN CODE",  // 顶部小字
    "title": "写给你的情书",
    "subtitle": "一些没写进 commit message 的话",
    "paragraphs": ["第一段…", "第二段…"],           // 每段一条
    "signature": "阿远，写在一个普通的想你的夜里",
    "footer": "每一行都是真的"
  },
  "settings": {
    "palette": "rose",           // rose | sunset | dusk
    "autoMilestones": true,      // 是否自动生成纪念日
    "milestoneDays": [100, 200, 300, 520, 1000],  // 在一起第 N 天
    "milestoneYears": 3,         // 自动生成到第几个周年（0 表示不生成）
    "hiddenAuto": [],            // 想藏起来的自动纪念日，如 ["auto:d100", "auto:y2"]
    "cover": "",                 // 左栏封面图路径，留空则取第一张照片
    "coverCaption": "按下快门的那一刻，刚好你在笑",
    "music": ""                  // 预留字段，暂未使用
  },
  "events": [
    {
      "id": "e-1",                       // 唯一即可
      "date": "2024-05-20",
      "title": "在一起",
      "text": "那天说了很久的话……",
      "images": ["assets/photos/sea-dusk.svg"],  // 最多 4 张
      "kind": "milestone"                // milestone 纪念日 | moment 日常
    }
  ]
}
```

**天数与周年的算法**

- 「在一起 N 天」= `startDate` + (N − 1) 天，所以在一起当天是「第 1 天」
- 「N 周年」= `startDate` 加 N 年
- 自动纪念日只在当天没有手写记录时才会出现；同一天既有 365 天又有 1 周年时，只显示 1 周年

---

## 照片

- 放进 `assets/photos/`，4:3 或 16:9 观感最好（当前示例是 SVG 占位图，换成自己的 jpg/png 即可）
- 在编辑器里上传的图片会在浏览器里压缩成 WebP（长边 ≤ 1400，尽量 ≤ 260KB）后**内联进 JSON**
- 50 张以内这样最省事；再多的话建议把图片单独放进 `assets/photos/`，JSON 里只写路径

---

## 部署到 GitHub Pages

1. 新建一个仓库，例如 `love-letter`（Public）
2. 把这个文件夹里的所有内容推上去（保持 `index.html` 在根目录）
3. 仓库 **Settings → Pages → Build and deployment**
   - Source: `Deploy from a branch`
   - Branch: `main`，目录 `/ (root)`，保存
4. 等 1–2 分钟，访问 `https://<你的用户名>.github.io/love-letter/`
5. 以后只需要改 `data/content.json` 并提交，Pages 会自动重新发布

> 仓库是公开的，内容是所有人都能看到的。想私密一点可以把仓库设为 Private（GitHub Pages 的私有仓库发布需要付费计划），或者干脆只在本地看。

---

## 目录结构

```
.
├── index.html            页面骨架
├── preview.bat           双击即可本地预览（Windows）
├── preview.ps1           preview.bat 的实际逻辑
├── css/
│   ├── base.css          配色、排版、左栏情书
│   ├── timeline.css      右侧时间轴
│   └── editor.css        编辑器抽屉
├── js/
│   ├── app.js            启动、渲染调度、飘心、灯箱
│   ├── content.js        数据规范化 + 时间轴/纪念日计算
│   ├── render.js         左栏与时间轴的 DOM 生成
│   ├── editor.js         浏览器内编辑器
│   ├── store.js          读取 JSON、本地草稿
│   ├── image.js          照片压缩
│   ├── date.js           日期工具
│   └── ui.js             提示、配色、下载、灯箱
├── data/
│   └── content.json      ← 唯一需要你改的文件
├── assets/
│   ├── photos/           照片
│   ├── preview.jpg       桌面端预览图
│   └── preview-mobile.jpg 移动端预览图
└── .nojekyll             让 GitHub Pages 跳过 Jekyll
```

---

## 一些细节

- 时间轴从上到下就是时间从早到晚；左边是日期和圆点，右边是卡片
- 顶部年份条会随滚动高亮，点一下跳到那一年；「今天」跳回当前进度
- 未来的条目显示「还有 N 天」，自动生成的纪念日是金色的
- 左栏大数字是「在一起的第几天」，下面那条进度是距离下一个纪念日
- 点照片可以放大，`Esc` 关闭
- 三套配色：玫瑰（默认）、落日、星河，在编辑器「情书 → 配色」里切换
- 系统开启「减少动态效果」时，飘心和入场动画会自动关掉
