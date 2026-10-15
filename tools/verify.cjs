// 驗證腳本：資料數量、珠位規則、兩種模式的操作、手機版與 3D 失效模式。
// 用法：NODE_PATH=$(npm root -g) node tools/verify.cjs <網址> [截圖資料夾]
// 註：無 GPU 的環境（SwiftShader）每秒只有數幀，鏡頭動畫需等較久，故等待時間設得較長。
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2], shots = process.argv[3];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = []; const ok = (n, c, x = '') => out.push((c ? 'PASS' : 'FAIL') + ' ' + n + (x !== '' ? '  ' + x : ''));
  const WAIT = 7000;
  const errs = [];
  const watch = (p, tag) => { p.on('requestfailed', r => { if (!/fonts\.g|supabase\.co/.test(r.url())) errs.push(tag + 'request failed ' + r.url()); }); p.on('pageerror', e => errs.push(tag + String(e))); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errs.push(tag + m.text()); }); };
  // 點珠／章／節後，內容顯示在珠內閱讀畫面（#bv-content）；其餘在右側面板
  const pane = p => p.evaluate(() => { const v = document.getElementById('beadview'); return (v && !v.hidden ? document.getElementById('bv-content') : document.getElementById('pane-content')).textContent; });
  const home = p => p.evaluate(() => { const v = document.getElementById('beadview'); document.getElementById(v && !v.hidden ? 'bv-back' : 'home').click(); }); // 返回整串

  /* ---------- 桌面 ---------- */
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); watch(p, 'desktop: ');
  await p.goto(url); await p.waitForFunction(() => window.__kmReady, null, { timeout: 90000 });
  await p.waitForTimeout(2500);
  const cc = await p.evaluate(() => KM3D.cordCheck());
  ok('擺動中串繩仍接在每顆珠的珠孔上', cc.bob > 0.03 && cc.worst < 0.02, 'bob ' + cc.bob.toFixed(3) + ' gap ' + cc.worst.toFixed(4));
  await p.click('#motion'); await p.waitForTimeout(1000);
  const st = await p.evaluate(() => KM3D.stats());
  ok('環上108顆', st.beads === 108);
  ok('隔珠在27/54/81/108', JSON.stringify(st.spacers) === '[27,54,81,108]');
  ok('串繩連續貫穿、珠心同圓', st.axisErr < 1e-6 && st.strings === 1);
  ok('相鄰珠不重疊', st.minGap > 0, st.minGap.toFixed(3));
  ok('隔珠一（第108顆）兼作佛頭珠（較大）、三通塔頭水平朝外', st.guruAbove && st.headIsSpacer108);
  ok('飾穗自塔頭垂下、位於珠外緣下方', st.tasselHangs);
  const d = await p.evaluate(() => {
    const D = KM.D, by = g => D.terms.filter(t => t.group === g).length;
    const slots = D.terms.map(t => t.slot), secs = D.chapters.reduce((a, c) => a + c.sections.length, 0), items = D.chapters.reduce((a, c) => a + c.sections.reduce((x, s) => x + (s.items || []).length, 0), 0);
    const t = n => D.terms.find(x => x.name === n);
    return { terms: D.terms.length, by: [by('見'), by('修'), by('行'), by('果')].join(), uniq: new Set(slots).size === slots.length, assigned: KM.ASSIGNED.length,
      inSpacer: slots.filter(s => s % 27 === 0).length, chapters: D.chapters.length, secs, items, ch14: D.chapters[13].sections.length, extras: D.extras.length,
      chizhou: [t('持咒').slot, t('持咒').show.join()], zhongyou: [t('密宗之中有解脫').slot, t('密宗之中有解脫').show.join()],
      ch7: D.chapters[6].vols.join(), ch9: D.chapters[8].vols.join(), quote: document.querySelector('#quote-full').textContent,
      chBeads: Object.values(KM.CH_BEAD).filter(n => !KM.BEADS[n].spacer).length };
  });
  ok('名相76（見17修21行19果19）', d.terms === 76 && d.by === '17,21,19,19', d.by);
  ok('每個名相唯一主珠位、無放在隔珠', d.uniq && d.inSpacer === 0 && d.assigned === 76);
  ok('持咒：主珠位修區、可顯示於修行', d.chizhou[0] >= 28 && d.chizhou[0] <= 53 && d.chizhou[1] === '修,行', d.chizhou.join(' '));
  ok('中有解脫：主珠位果區、可顯示於果修', d.zhongyou[0] >= 82 && d.zhongyou[0] <= 107 && d.zhongyou[1] === '果,修', d.zhongyou.join(' '));
  ok('17章、節160（含第七章第三節上下半）、目21', d.chapters === 17 && d.secs === 160 && d.items === 21, d.secs + '/' + d.items);
  ok('第十四章40節', d.ch14 === 40);
  ok('第七章跨一二輯、第九章跨二三輯（同一章）', d.ch7 === '1,2' && d.ch9 === '2,3');
  ok('序、附錄、跋等8個入口', d.extras === 8);
  ok('17章各配1顆普通數珠', d.chBeads === 17);
  const Q = '以數珠為喻：西藏密宗乃是以種種虛構之觀想法、持外道咒、天瑜伽、遷識⋯等外道法為數珠，以風瑜伽為隔珠，以佛教教相及僧寶表相為佛頭珠；以自己所定義之般若中觀名相及果位修證名相，作為佛頭珠所懸之飾穗，最後以淫樂之樂空雙運欲界外道雙身法為串繩，貫串密宗之一切成佛理論與行門。如是串成之數珠，即是西藏密教之真實宗義。－－平實導師－－';
  ok('引文逐字一致', d.quote === Q);
  ok('以數珠為喻頁：引文全文展開於念珠中央（碑文）', await p.isVisible('#quote-full') && (await p.textContent('#quote-full')) === Q && !(await p.isVisible('#quote-toggle')));
  ok('以數珠為喻頁：標出四顆隔珠標題', await p.evaluate(() => [...document.querySelectorAll('.lab-parts.lab-sp')].filter(e => e.style.display !== 'none').length) === 4);
  ok('總覽顯示部件與四隔珠標題（佛頭、飾穗、數珠、串繩＋隔珠・見修行果，隔珠・行附風瑜伽）', await p.evaluate(() => { const v = [...document.querySelectorAll('.lab-parts.lab-part')].filter(e => e.style.display !== 'none').map(e => e.textContent); return v.length === 8 && v.includes('隔珠・行風瑜伽') && !v.some(t => /隔珠[一二三四]/.test(t)); }));
  ok('背景不再使用禪林圖、說明區無 AI 示意配圖', await p.evaluate(() => !document.querySelector('.zen') && !document.querySelector('img[src*=contemplation]')));
  if (shots) await p.screenshot({ path: shots + '/d1-overview.png' });

  const c5 = await p.evaluate(() => KM3D.screenOf(5)); await p.mouse.click(c5.x, c5.y);
  await p.waitForFunction(() => Math.abs(KM3D.screenOf(5).x - 534) < 30, null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(1500);
  ok('點珠：進入珠內閱讀，直接顯示名相與章節', (await pane(p)).includes('章節') && await p.isVisible('#beadview'));
  ok('珠內閱讀：左右露出相鄰珠名', (await p.textContent('#bv-prev .bv-name')).length > 0 && (await p.textContent('#bv-next .bv-name')).length > 0);
  const s5 = await p.evaluate(() => KM3D.screenOf(5));
  ok('點珠：珠子轉到畫面中央', Math.abs(s5.x - 534) < 30, Math.round(s5.x) + ',' + Math.round(s5.y));
  ok('珠內閱讀：該顆數珠放大並半透明，相鄰珠也半透明', await p.evaluate(() => KM3D.isReading() && KM3D.opacityOf(5) < 0.45 && KM3D.opacityOf(6) < 0.7 && KM3D.opacityOf(6) > 0.3));

  ok('右側面板在閱讀時仍顯示', await p.isVisible('#panel'));
  if (shots) await p.screenshot({ path: shots + '/d2-bead.png' });
  await p.evaluate(() => KM.go('bead:17')); await p.waitForTimeout(800); await p.click('#bv-next'); await p.waitForTimeout(500);
  ok('下一珠跳過待配置（17→28）', (await p.evaluate(() => KM.getSel().n)) === 28);
  await p.click('#bv-prev'); await p.waitForTimeout(300);
  ok('上一珠（28→17）', (await p.evaluate(() => KM.getSel().n)) === 17);
  await p.evaluate(() => KM.go('bead:20')); await p.waitForTimeout(300);
  ok('未配置珠位顯示待配置', (await pane(p)).includes('待配置珠位'));
  await p.evaluate(() => KM.go('zone:2')); await p.waitForTimeout(300);
  ok('以數珠為喻點四區：直接進入見修行果名相頁的該區', await p.evaluate(() => document.body.classList.contains('mode-terms') && KM.getSel().k === 'zone' && KM.getSel().z === 2));
  ok('行區列出跨類的持咒（同一珠位）', await p.evaluate(() => !![...document.querySelectorAll('#pane-content .chip.cross')].find(e => e.textContent.includes('持咒') && e.dataset.go === 'bead:' + KM.D.terms.find(t => t.name === '持咒').slot)));
  await home(p); await p.waitForTimeout(WAIT);
  await p.click('#mode-terms'); await p.waitForTimeout(2500);
  { await p.mouse.move(5, 890); await p.click('#motion'); await p.waitForTimeout(1500); const r0 = await p.evaluate(() => KM3D.stats().rotY); await p.waitForTimeout(5000); const r1 = await p.evaluate(() => KM3D.stats().rotY); await p.click('#motion'); await p.waitForTimeout(500); ok('名相頁總覽：念珠會自轉（與其他頁相同）', Math.abs(r1 - r0) > 0.003, (r1 - r0).toFixed(4)); }
  ok('名相頁總覽：只標四顆隔珠，四區各有半透明罩體', await p.evaluate(() => [...document.querySelectorAll('.lab-terms')].filter(e => e.style.display !== 'none').length === 4 && KM3D.hullsVisible() === 4));
  ok('名相頁面板列出四區全部名相', (await pane(p)).includes('如來藏') && (await pane(p)).includes('密宗之中有解脫') && (await pane(p)).includes('三昧耶戒'));
  if (shots) await p.screenshot({ path: shots + '/d-terms.png' });
  const hb = await p.evaluate(() => KM3D.screenOf(40)); await p.mouse.click(hb.x, hb.y + 3); await p.waitForTimeout(600);
  ok('點罩體（或區內珠）進入該區', JSON.stringify(await p.evaluate(() => KM.getSel())) === '{"k":"zone","z":1}');
  await p.click('.lab-terms[data-act="zone:0"]').catch(() => p.evaluate(() => KM.go('zone:0'))); await p.evaluate(() => KM.go('zone:0')); await p.waitForTimeout(WAIT);
  ok('區畫面：該區名相全部列出（見區 17 個）', await p.evaluate(() => [...document.querySelectorAll('.lab-zterm')].filter(e => e.style.display !== 'none').length) === 17);
  if (shots) await p.screenshot({ path: shots + '/d-zone.png' });
  await p.click('.lab-zterm[data-act="bead:1"]'); await p.waitForTimeout(1500);
  ok('點名相進入該珠（仍在名相頁）', (await p.evaluate(() => KM.getSel().n + ' ' + KM.getMode())) === '1 terms');
  await p.click('#bv-back'); await p.waitForTimeout(800);
  ok('從珠內返回該區', JSON.stringify(await p.evaluate(() => KM.getSel())) === '{"k":"zone","z":0}');
  await p.evaluate(() => KM.go('bead:1')); await p.waitForTimeout(300);
  await p.click('#bv-content .ref[data-go="sec:6-1"]'); await p.waitForTimeout(500);
  ok('由名相的章節頁碼進入原書導讀同一節', (await p.evaluate(() => KM.getMode() + ' ' + KM.getSel().id)) === 'book 6-1');

  await home(p); await p.waitForTimeout(WAIT);
  ok('原書導讀：右下引文移除，改為念珠中央的兩段題辭碑文（含《狂密與真密》標題）', await p.evaluate(() => !document.getElementById('main-quote').offsetParent && getComputedStyle(document.getElementById('book-stele')).display === 'grid' && [...document.querySelectorAll('#book-stele .verse')].length === 2 && [...document.querySelectorAll('#book-stele .vt')].every(e => e.textContent === '《狂密與真密》')));
  ok('原書導讀：兩段題辭輪流顯示', await p.evaluate(() => [...document.querySelectorAll('#book-stele .verse')].every(e => getComputedStyle(e).animationName === 'verse')));
  ok('原書導讀：顯示17章名', await p.evaluate(() => [...document.querySelectorAll('.lab-book')].filter(e => e.style.display !== 'none').length) >= 14);
  if (shots) await p.screenshot({ path: shots + '/d3-book.png' });
  await p.evaluate(() => KM.go('chapter:c14')); await p.waitForTimeout(WAIT);
  ok('章：顯示目前範圍「第1–7節／共40節」', (await pane(p)).includes('第 1–7 節／共 40 節'));
  for (let i = 0; i < 5; i++) { await p.click('[data-batch="c14:1"]'); }
  ok('換批到最後一批（第36–40節）', (await pane(p)).includes('第 36–40 節／共 40 節'));
  ok('最後一批「後一批」停用', await p.$eval('[data-batch="c14:1"]', e => e.disabled));
  if (shots) await p.screenshot({ path: shots + '/d4-chapter.png' });
  await p.click('#bv-next'); await p.waitForTimeout(300);
  ok('下一章只走章入口（14→15）', (await p.evaluate(() => KM.getSel().id)) === 'c15');
  await p.evaluate(() => KM.go('sec:16-1')); await p.waitForTimeout(300);
  ok('選節展開目（第十六章第一節三目）', await p.$$eval('#bv-content .items.open .irow', e => e.length) === 3);
  await p.evaluate(() => KM.go('sec:7-3b')); await p.waitForTimeout(300);
  ok('第七章第三節下半屬同一章（第二輯）', (await pane(p)).includes('第七章') && (await pane(p)).includes('第二輯'));
  await home(p); await p.waitForTimeout(800);
  await p.click('#tab-toc');
  const toc = await p.evaluate(() => ({ ch: document.querySelectorAll('#pane-toc details').length, rows: document.querySelectorAll('#pane-toc .trow').length }));
  ok('完整目次：17章、181節目＋8入口', toc.ch === 17 && toc.rows === 181 + 8, JSON.stringify(toc));
  await p.click('#mode-mala'); await p.waitForTimeout(300);
  ok('一鍵切回以數珠為喻', (await p.evaluate(() => KM.getMode())) === 'mala');

  await p.close();
  /* ---------- 手機 ---------- */
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true }); watch(m, 'mobile: ');
  await m.goto(url); await m.waitForFunction(() => window.__kmReady, null, { timeout: 90000 });
  ok('手機無橫向捲動', (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await m.evaluate(() => KM.go('chapter:c14')); await m.waitForTimeout(500);
  ok('手機每批5節', (await pane(m)).includes('第 1–5 節／共 40 節'));
  if (shots) await m.screenshot({ path: shots + '/m1.png' });

  await m.close();
  /* ---------- 3D 失效 ---------- */
  const f = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await f.route('**/vendor/three.min.js', r => r.abort());
  await f.goto(url); await f.waitForTimeout(1500);
  ok('3D 失效：顯示提示且目次可用', await f.isVisible('#gl-fail') && (await f.$$eval('#pane-toc .trow', e => e.length)) === 189);
  await f.evaluate(() => KM.go('sec:14-40'));
  ok('3D 失效：仍可閱讀章節', (await pane(f)).includes('第四十節'));

  ok('無 JS 錯誤', errs.length === 0, errs.join(' | '));
  console.log(out.join('\n'));
  await b.close();
})();
