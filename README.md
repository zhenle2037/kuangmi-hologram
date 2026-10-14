# 以數珠為喻 — 《狂密與真密》導覽（全息版）

純靜態網站，入口 `index.html`。3D 以 three.js r128（MIT）＋ OrbitControls ＋ GSAP 3.12.2 呈現，函式庫放在 `vendor/`（不依賴 CDN）。

- 內容資料：`data/content.js`（目次、名相、珠位配置、部件說明；補充正文只改此檔）
- 狀態、面板、目次：`app.js`
- 3D 星系與念珠、飛近特寫、引線與文字入口：`scene.js`
- 樣式：`style.css`
- 驗證：`NODE_PATH=$(npm root -g) node tools/verify.cjs file://$PWD/index.html <截圖資料夾>`（Playwright＋SwiftShader，針對本版）

WebGL 無法啟動時，面板與原書目次仍可完整使用。

尚待補：各章節、目、頁碼；各輯分界（僅第七、第九章跨輯已知）；名相與單章的細部對應；正文、解說、出處。
