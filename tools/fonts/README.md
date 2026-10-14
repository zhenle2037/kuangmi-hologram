# 字型裁切

網站使用思源宋體（Noto Serif TC，SIL OFL 1.1），只保留網站用到的字，放在 `assets/fonts/`。
若 `data/content.js` 新增了原本沒有的字，請重新裁切：

    npm pack @fontsource/noto-serif-tc && mkdir pkg && tar xzf fontsource-noto-serif-tc-*.tgz -C pkg
    pip install fonttools brotli
    python3 tools/fonts/subset_font.py pkg/package/files .
    python3 tools/fonts/merge_font.py .
