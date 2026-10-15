# 字型裁切

網站使用思源宋體（Noto Serif TC，SIL OFL 1.1），只保留網站用到的字，放在 `assets/fonts/`。
若 `data/content.js` 新增了原本沒有的字，請重新裁切：

    npm pack @fontsource/noto-serif-tc && mkdir pkg && tar xzf fontsource-noto-serif-tc-*.tgz -C pkg
    pip install fonttools brotli
    python3 tools/fonts/subset_font.py pkg/package/files .

裁切後每個字重只有幾個檔（大部分字在「繁體中文」切片），以 unicode-range 載入。
不要合併成單一檔：合併會讓直書（碑文）的字位置錯亂。
資料庫（後台）新增網站沒有的字時，瀏覽器會改用 Google Fonts 的思源宋體顯示，不影響閱讀；想讓這些字也用自帶字型，重新執行上面的裁切即可。
