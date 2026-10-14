// 驗證腳本：針對 kuangmi/ three.js 全息版。用法：NODE_PATH=$(npm root -g) node tools/verify.cjs <網址> <截圖資料夾>
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2], shots = process.argv[3];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = []; const ok = (n, c, x = '') => out.push((c ? 'PASS' : 'FAIL') + ' ' + n + (x !== '' ? ' ' + x : ''));
  const W8 = 2600;
  const txt = p => p.textContent('#pane-content');
  const home = async p => { await p.click('#home'); await p.waitForTimeout(W8); };
  const clickBead = async (p, n) => { const s = await p.evaluate(n => KM3D.screenOf(n), n); await p.mouse.click(s.x, s.y); await p.waitForTimeout(W8); };
  for (const [name, vp] of [['desktop', { width: 1366, height: 850 }], ['mobile', { width: 390, height: 800 }]]) {
    const p = await b.newPage({ viewport: vp, hasTouch: name === 'mobile' });
    const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(url); await p.waitForFunction(() => window.__kmReady, null, { timeout: 30000 });
    await p.click('#motion'); await p.waitForTimeout(1500);
    if (name === 'desktop') {
      const st = await p.evaluate(() => KM3D.stats());
      const dom = await p.evaluate(() => ({ quote: document.querySelector('#quote').textContent, chapters: document.querySelectorAll('#pane-toc > ul.toc:first-of-type > li').length, assigned: KM.ASSIGNED }));
      ok('環上108顆', st.beads === 108);
      ok('隔珠位置27/54/81/108（另104顆普通數珠）', JSON.stringify(st.spacers) === '[27,54,81,108]');
      ok('每區普通珠26', await p.evaluate(() => [0, 1, 2, 3].map(z => KM.BEADS.filter(b => b && !b.spacer && b.z === z).length).join()) === '26,26,26,26');
      ok('所有珠心在同一圓（串繩貫穿）', st.axisErr < 1e-6 && st.strings === 1);
      ok('相鄰珠不重疊', st.minGap > 0, st.minGap.toFixed(3));
      ok('佛頭珠在第108顆正上方、飾穗在佛頭珠尾端', st.guruAbove && st.tasselAbove);
      ok('17章入口', dom.chapters === 17);
      const q = '以數珠為喻：西藏密宗乃是以種種虛構之觀想法、持外道咒、天瑜伽、遷識⋯等外道法為數珠，以風瑜伽為隔珠，以佛教教相及僧寶表相為佛頭珠；以自己所定義之般若中觀名相及果位修證名相，作為佛頭珠所懸之飾穗，最後以淫樂之樂空雙運欲界外道雙身法為串繩，貫串密宗之一切成佛理論與行門。如是串成之數珠，即是西藏密教之真實宗義。－－平實導師－－';
      ok('首頁引文逐字一致', dom.quote === q);
      await p.screenshot({ path: shots + '/desktop-overview.png' });
      await clickBead(p, 5);
      const c5 = await p.evaluate(() => KM3D.screenOf(5));
      const cx = (1366 - 420) / 2, cy = 850 / 2 - 55;
      ok('點第5珠：轉到畫面中央', Math.abs(c5.x - cx) < 6 && Math.abs(c5.y - cy) < 6, [c5.x.toFixed(0), c5.y.toFixed(0), cx, cy].join());
      ok('點珠：面板顯示名相', (await txt(p)).includes('實相菩提心'));
      ok('章名引線標籤3個', await p.evaluate(() => document.querySelectorAll('#fan .fl').length) === 3);
      ok('引文在特寫時淡出', await p.evaluate(() => document.getElementById('main-quote').classList.contains('hide')));
      await p.screenshot({ path: shots + '/desktop-bead.png' });
      await p.click('#fan .fl'); await p.waitForTimeout(W8); ok('點章名引線文字→章', (await txt(p)).includes('如來藏見'));
      await p.click('#lines'); ok('引線可關閉', await p.evaluate(() => getComputedStyle(document.getElementById('leaders')).display === 'none')); await p.click('#lines');
      await home(p); await clickBead(p, 1);
      const seq = []; for (let i = 0; i < 10; i++) { await p.click('#next'); seq.push(await p.evaluate(() => +location.hash.split('-')[1])); }
      ok('下一個只在已配置珠位', seq.every(n => dom.assigned.includes(n)), seq.join(','));
      await p.click('#home'); await p.evaluate(() => KM.go('bead:8')); await p.click('#next');
      ok('跨區跳過待配置(8→28)', (await p.evaluate(() => location.hash)) === '#bead-28');
      await p.click('#prev'); ok('上一個', (await p.evaluate(() => location.hash)) === '#bead-8');
      await home(p); await p.click('.lab[data-act="spacer:1"]'); await p.waitForTimeout(W8); ok('點隔珠文字', (await txt(p)).includes('風瑜伽'));
      await home(p); await clickBead(p, 108); ok('點第四隔珠（3D）', (await txt(p)).includes('隔珠四'));
      await p.screenshot({ path: shots + '/desktop-spacer.png' });
      await home(p); { const s = await p.evaluate(() => KM3D.screenOf('head')); await p.mouse.click(s.x, s.y); await p.waitForTimeout(W8); }
      ok('點佛頭珠（3D）', (await txt(p)).includes('以佛教教相及僧寶表相為佛頭珠'));
      await p.screenshot({ path: shots + '/desktop-head.png' });
      await home(p); await p.click('.lab[data-act="part:tassel"]'); await p.waitForTimeout(W8); ok('飾穗說明', (await txt(p)).includes('所懸之飾穗'));
      await home(p); await p.click('.lab[data-act="part:string"]'); ok('串繩說明', (await txt(p)).includes('樂空雙運欲界外道雙身法為串繩'));
      await home(p); await p.click('.lab[data-act="part:bead"]'); ok('普通數珠說明', (await txt(p)).includes('天瑜伽、遷識'));
      await home(p); await p.click('.lab[data-act="zone:2"]'); await p.waitForTimeout(W8); ok('點區段標籤', (await txt(p)).includes('行（將修法'));
      await p.screenshot({ path: shots + '/desktop-zone.png' });
      await home(p); await p.click('#tab-toc'); await p.click('[data-go="chapter:c07"]'); await p.waitForTimeout(800);
      ok('目次→內容（第7章跨輯上下半）', (await txt(p)).includes('上半') && (await txt(p)).includes('下半'));
      await p.click('#tab-toc'); await p.click('[data-go="chapter:c15"]'); ok('第15章無配置仍可進入', (await txt(p)).includes('尚未配置'));
      await p.selectOption('#chsel', 'chapter:c12'); ok('章節快速選取', (await txt(p)).includes('神通'));
      // 動態
      await home(p); await p.click('#motion');
      const a = await p.evaluate(() => KM3D.stats().rotY); await p.waitForTimeout(2500); const a2 = await p.evaluate(() => KM3D.stats().rotY);
      ok('動態開啟：念珠持續旋轉', Math.abs(a2 - a) > 0.02, (a2 - a).toFixed(3));
      await p.click('#motion'); await p.waitForTimeout(1500);
      const c1 = await p.evaluate(() => KM3D.stats().rotY); await p.waitForTimeout(1000); const c2 = await p.evaluate(() => KM3D.stats().rotY);
      ok('暫停動態後靜止', Math.abs(c2 - c1) < 1e-4);
    } else {
      await p.waitForTimeout(300);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok('手機無橫向捲動', sw <= 392, sw);
      await p.screenshot({ path: shots + '/mobile-overview.png' });
      const s = await p.evaluate(() => KM3D.screenOf(27)); await p.touchscreen.tap(s.x, s.y); await p.waitForTimeout(W8);
      ok('手機點隔珠（觸控 3D）', (await txt(p)).includes('隔珠一'), await p.evaluate(() => location.hash));
      await p.screenshot({ path: shots + '/mobile-spacer.png' });
      await p.click('#next'); await p.waitForTimeout(W8); ok('手機左右切換', (await p.evaluate(() => location.hash)).startsWith('#bead-'));
      await p.screenshot({ path: shots + '/mobile-bead.png' });
    }
    ok(name + ' 無JS錯誤', errs.length === 0, errs.join('|'));
    await p.close();
  }
  console.log(out.join('\n')); await b.close();
})();
