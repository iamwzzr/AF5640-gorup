# 图片与语言展示说明

## 配图用途

| 文件 | 用途 | 制作方式 |
| --- | --- | --- |
| `frontend/public/project/payout-review.webp` | 介绍页使用场景：运营人员逐人核对本期发放 | 内置 `image_gen` 生成，1200 × 800 WebP |
| `frontend/public/project/report-handoff.webp` | 介绍页报告交接：交付复查结果与依据 | 内置 `image_gen` 生成，1200 × 800 WebP |
| `frontend/public/project/core-review.png` | 中文工具中 B 的金额与原始来源 | 浏览器截图，当前程序的 5 人合成样本 |
| `frontend/public/project/core-review-en.png` | 相同案例的英文界面 | 浏览器截图，当前程序的 5 人合成样本 |

两张插画均为虚构场景，不是真实客户影像，不是付款凭证或产品截图。无内嵌文字、金额、品牌或币种，适合中英文共用。数值与解释由 HTML 和当前核对结果提供。原始生成图保留在 Codex 的 generated_images 中；项目使用经过等比例缩放和 WebP 编码的副本，无外部图片请求。

首屏的软件窗口是 HTML 交互预览，使用 `evidence.json` 中由当前程序生成的5人结果，金额保持十进制字符串。它与可上传文件的完整工具通过按钮连接。两张实际工具截图随本轮导航与样式更新重新截取，截图中的 B 仍对应原始名单、付款记录第3行。

## 最终生成提示

使用内置工具 `image_gen.imagegen`，未使用 CLI/API 回退；两次均未要求透明背景。

### payout-review.webp

Use case: illustration-story. Asset type: landscape editorial illustration for the DistributionCheck website project introduction. Primary request: a thoughtful financial operations professional at a desk checking whether individual people have received an income payout. Scene: a contemporary small office, the professional looking between an open laptop and three paper records, a tidy pencil and folder nearby, another empty chair in the background. The laptop and papers contain only abstract rows and small teal marks, with absolutely no readable text, numbers, logos, currencies or brands. Style: refined hand-rendered editorial illustration, subtle paper grain, confident organic outlines and restrained dimensional shading, friendly and credible rather than cartoonish or futuristic. Colors: deep teal #17695d, dark blue-gray #20383d, sage #dcebe3, muted warm gold #d2a858, white and pale cool gray. Wide landscape framing around 3:2. Compose the scene centrally with generous white space around the figures so it can be cropped responsively. Show the human act of checking records, with no coins, no crypto logos, no floating dashboards, no stock charts, no robots, no embedded typography, no watermark. This is an illustrative fictional scene, not a photograph or an interface screenshot.

### report-handoff.webp

Use case: illustration-story. Asset type: landscape editorial illustration for a payout review website, DistributionCheck. Primary request: two colleagues in a small modern office handing over a reviewed payout report, conveying a clear, accountable handoff after checking records. A financial operations professional with dark hair tied in a loose bun and a deep teal shirt hands a slim open folder to a colleague across the desk; both are calm and focused, with an open laptop and a neat stack of records nearby. The report contains abstract tidy lines, small circles and neutral check marks only: absolutely no readable text, numbers, brand logos or currency symbols. Style: refined hand-rendered editorial illustration with subtle paper grain, confident organic outlines, natural proportions and restrained dimensional shading, professional and approachable, matching a teal financial operations website. Palette: deep teal #17695d, dark blue-gray #20383d, sage #dcebe3, muted warm gold #d2a858, white and pale cool gray. Wide landscape around 3:2, main subjects centrally composed with generous surrounding light space and uncluttered background. No crypto coins, no floating interfaces, no stock charts, no robots, no oversized checkmark symbol, no photorealism, no embedded typography, no watermark. The scene is illustrative and fictional, not documentary evidence.

## 语言原则

- 默认简体中文；选择 English 后记住当前浏览器偏好。禁止存储时仍可在当前页面切换。
- 切换时保留应用状态；语言不作为请求的计算规则，不修改原始 CSV、编号、地址、金额或结果指纹。
- UI 提示使用完整、可回查的英语解释；金额继续按十进制字符串显示，不转换为浮点数。
- PDF 使用打印时当前选择的语言，连续介绍的七个段落均打印；项目详情自动展开并在打印后恢复。当前竖向 A4 输出为中英文各7页。
