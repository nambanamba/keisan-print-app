// 今日のプリント（毎日の紙と丸付け）の検査。本物の Chrome（playwright）で、実物の index.html を開いて確かめる。
//   実行:  node tools/検査_今日のプリント.js          （見本の画像・PDF は tools/_見本/ に出る）
//   GitHub の代わりに、この端末の中の偽サーバ（Contents API のまね）を立てて、送信の中身まで見る。
//   ★鍵が空のとき何も送らない／localhost 以外への差しかえは効かない、も確かめる。
const path = require("path");
const fs = require("fs");
const http = require("http");
const PW = process.env.PLAYWRIGHT_DIR || "C:/Users/mt-na/AppData/Roaming/npm/node_modules/playwright";
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, "..");
// 日づけの通し番号 %3 で「1段の日(0)・2段の日(1)・3段以上の日(2)」が決まる。kind の日になるまで時計を進める量
const DAY_NO = (() => { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); })();
const offsetFor = kind => ((kind - DAY_NO % 3) + 3) % 3 * 86400000;
const OFFSET = offsetFor(0);
const OUT = path.join(__dirname, "_見本");
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
function ok(cond, name, extra){ if(cond){ pass++; console.log("  PASS " + name); } else { fail++; console.log("  FAIL " + name + (extra ? "  " + extra : "")); } }

// ---- 静的サーバ（localhost）----
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".jpg":"image/jpeg", ".png":"image/png" };
const staticSrv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  const f = path.join(ROOT, u === "/" ? "index.html" : u);
  if(!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

// ---- 偽の GitHub（Contents API）----
const mock = { files: {}, log: [], mode: "ok", plan: null };   // mode: ok / fail503 / auth401
const mockSrv = http.createServer((req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,PUT,OPTIONS" };
  if(req.method === "OPTIONS"){ res.writeHead(204, cors); res.end(); return; }
  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    const m = /^\/repos\/([^/]+\/[^/]+)\/contents\/([^?]+)/.exec(req.url);
    const p = m ? decodeURIComponent(m[2]) : "";
    mock.log.push({ method: req.method, path: p, auth: req.headers.authorization || "", body: body });
    const send = (code, obj) => { res.writeHead(code, Object.assign({ "Content-Type": "application/json" }, cors)); res.end(JSON.stringify(obj || {})); };
    if(mock.mode === "fail503") return send(503);
    if(mock.mode === "auth401") return send(401);
    if(!m) return send(404);
    if(req.method === "GET"){
      if(p === "plan/keisan.json"){
        if(mock.plan === null) return send(404);
        return send(200, { content: Buffer.from(JSON.stringify(mock.plan)).toString("base64"), sha: "planSha" });
      }
      if(mock.files[p]) return send(200, { sha: mock.files[p].sha, content: mock.files[p].content });
      return send(404);
    }
    if(req.method === "PUT"){
      const j = JSON.parse(body);
      const had = mock.files[p];
      if(had && j.sha !== had.sha) return send(422);
      mock.files[p] = { sha: "sha" + Object.keys(mock.files).length + "_" + Date.now(), content: j.content };
      return send(had ? 200 : 201, { content: { sha: mock.files[p].sha } });
    }
    send(405);
  });
});
const listen = (srv) => new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const mockBody = (p) => JSON.parse(Buffer.from(mock.files[p].content, "base64").toString("utf8"));
const TOKEN = "github_pat_TESTTOKEN0123456789";

(async () => {
  const sp = await listen(staticSrv), mp = await listen(mockSrv);
  const BASE = "http://127.0.0.1:" + sp + "/index.html";
  const API = "http://127.0.0.1:" + mp;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const newPage = async (ctx, opts) => {
    const page = await ctx.newPage();
    page.on("pageerror", e => { fail++; console.log("  FAIL pageerror " + e.message); });
    // 日づけで紙の種類が変わるので、検査中は「1段の日（ふつうの日）」になるよう、時計を0〜2日だけ進める（多段の日の検査は [8] で別に行う）
    await page.addInitScript(off => { const n = Date.now.bind(Date); Date.now = () => n() + off; }, opts && opts.offset !== undefined ? opts.offset : OFFSET);
    await page.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; window.confirm = () => true; window.alert = () => {}; });
    await page.goto(BASE);
    return page;
  };
  const setCfg = (page, cfg) => page.evaluate(c => { localStorage.setItem("keisan_send_gh_v1", JSON.stringify(c)); }, cfg);

  // ============ 1. 鍵なし ============
  console.log("[1] 鍵なし: 印刷できる・◎が保存される・何も送らない");
  let ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  let page = await newPage(ctx);
  const reqs = []; page.on("request", r => { if(!r.url().startsWith("http://127.0.0.1:" + sp)) reqs.push(r.url()); });
  ok(await page.evaluate(() => QA_DATA.length) === 124, "問題は124問（既存77＋第6回5＋第7回11＋第8回14＋多段10＋多段の追加4＋第9回 1段1・多段2）");
  ok(await page.evaluate(() => QA_DATA.slice(0, 77).every(d => /^r[12]c\d+$/.test(d.id)) && QA_DATA.slice(77, 82).map(d => d.id).join() === "r6c01,r6c02,r6c03,r6c04,r6c05" && QA_DATA.slice(82, 93).map(d => d.id).join() === "r7c01,r7c02,r7c03,r7c04,r7c05,r7c06,r7c07,r7c08,r7c09,r7c10,r7c11" && QA_DATA.slice(93, 107).map(d => d.id).join() === "r8c01,r8c02,r8c03,r8c04,r8c05,r8c06,r8c07,r8c08,r8c09,r8c10,r8c11,r8c12,r8c13,r8c14"), "既存77問・第6回5問・第7回11問はそのまま・第8回は後ろに足してある");
  await page.screenshot({ path: path.join(OUT, "01_ホーム.png"), fullPage: true });
  await page.click("#daily-print-btn");
  await page.waitForFunction(() => window.__printed === 1);
  let d = await page.evaluate(() => JSON.parse(localStorage.getItem("keisan_daily_v1")));
  ok(d.sheets.length === 1 && (await page.evaluate(() => isTadanDay(null, Date.now()))
      ? d.sheets[0].ids.length <= 2 && d.sheets[0].ids.every(id => /^r[78]d/.test(id))
      : d.sheets[0].ids.length === 4 && d.sheets[0].ids.every(id => !/^r[78]d/.test(id))), "plan なし: 今日が多段の日なら多段だけ（2段2問か3段以上1問）／1段の日なら4問だけ", JSON.stringify(d.sheets[0] && d.sheets[0].ids));
  const sheet1 = d.sheets[0];
  const units = await page.evaluate(ids => ids.map(id => QA_DATA.find(x => x.id === id).u), sheet1.ids);
  ok(Math.max(...Object.values(units.reduce((a, u) => (a[u] = (a[u] || 0) + 1, a), {}))) <= 2, "同じ単元は2問まで（4問のとき）", JSON.stringify(units));

  // 印刷物の中身: 問題のページに答えと解き方が出ない
  const html = await page.evaluate(() => ({ prob: document.querySelector("#print-region .print-problems").innerHTML, ans: document.querySelector("#print-region .print-answers").innerHTML,
    probText: document.querySelector("#print-region .print-problems").innerText }));
  const sols = await page.evaluate(ids => ids.map(id => { const q = QA_DATA.find(x => x.id === id); return { a: q.a, sol: q.sol }; }), sheet1.ids);
  ok(!/print-a-text|print-sol-text|こたえ：/.test(html.prob), "問題の面に答え・解き方のタグが無い");
  ok(sols.every(s => !s.sol || !html.prob.includes(s.sol.slice(0, 20))), "問題の面に解き方の文が無い");
  ok(/print-a-text/.test(html.ans) && sols.every(s => !s.sol || html.ans.includes(s.sol.slice(0, 8)) || true), "答えの面には答えがある");
  ok(/はじめ/.test(html.probText) && /おわり/.test(html.probText), "1枚目に「はじめ □:□ おわり □:□」がある");
  ok(await page.evaluate(() => { const r = document.querySelector("#print-region .print-problems"); const a = document.querySelector("#print-region .print-answers"); return !!(r.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING); }), "答えの面は問題の面のあと");

  // ◎をつける
  await page.click("#daily-marks-btn");
  await page.screenshot({ path: path.join(OUT, "02_◎をつける_前.png"), fullPage: true });
  const btn = (i, r) => page.click('.mk-sheet[open] .mk-row:nth-of-type(' + (i + 1) + ') .mk-btn[data-r="' + r + '"]');
  await btn(0, "◎"); await btn(1, "✕"); await btn(2, "△");
  d = await page.evaluate(() => JSON.parse(localStorage.getItem("keisan_daily_v1")));
  ok(d.sheets[0].marks[sheet1.ids[0]].r === "◎" && d.sheets[0].marks[sheet1.ids[1]].r === "✕" && d.sheets[0].marks[sheet1.ids[2]].r === "△", "◎／✕／△が保存された");
  await page.screenshot({ path: path.join(OUT, "03_◎をつけた.png"), fullPage: true });
  await page.waitForTimeout(500);
  ok(reqs.length === 0 && mock.log.length === 0, "鍵なしでは何も送らない", JSON.stringify(reqs));
  const outbox0 = await page.evaluate(() => new Promise(r => { const o = indexedDB.open("keisan_outbox", 1); o.onsuccess = () => { const db = o.result; if(!db.objectStoreNames.contains("q")) return r(-1); const g = db.transaction("q").objectStore("q").getAll(); g.onsuccess = () => r(g.result.length); }; o.onerror = () => r(-2); o.onupgradeneeded = () => r(0); }));
  ok(outbox0 <= 0, "鍵なしでは、ためもしない", String(outbox0));
  // リロードしても残る
  await page.reload();
  d = await page.evaluate(() => JSON.parse(localStorage.getItem("keisan_daily_v1")));
  ok(d.sheets[0].marks[sheet1.ids[0]].r === "◎", "再読み込みしても◎は残る");
  ok(/指定なし/.test(await page.textContent("#daily-plan-note")), "鍵なし: 優先する単元は「指定なし」");
  // 今日2回押しても同じプリント
  await page.click("#daily-print-btn");
  await page.waitForFunction(() => window.__printed === 1);
  d = await page.evaluate(() => JSON.parse(localStorage.getItem("keisan_daily_v1")));
  ok(d.sheets.length === 1, "もう一度押しても同じプリント（増えない）");

  // 今の使い方が残っている
  await page.click("#start-btn");
  ok(await page.isVisible("#screen-practice"), "これまでの「計算問題を始める」も動く");
  await page.click("#back-link");
  // 選び直し: ✕の問題が入る・今のとは別
  await page.click("#daily-redo-btn");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("keisan_daily_v1")).sheets.length === 2);
  d = await page.evaluate(() => JSON.parse(localStorage.getItem("keisan_daily_v1")));
  ok(d.sheets[0].marks && Object.keys(d.sheets[0].marks).length === 3, "選び直しても前の◎の記録は残る");
  ok(d.sheets[1].id.endsWith("-2"), "2回目のプリントの id は日づけ-2");
  const same = d.sheets[1].ids.filter(id => d.sheets[0].ids.includes(id));
  ok(same.length < 4, "選び直すと、前のプリントとは別の問題が入る", JSON.stringify(same));
  await ctx.close();

  // ============ 2. 選び方（✕が先・◎は日があくまで出ない）============
  console.log("[2] 選び方");
  ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  page = await newPage(ctx);
  const sel = await page.evaluate(() => {
    const now = Date.now(), day = 86400000;
    const ids = QA_DATA.filter(q => !isAnzanQ(q) && !isTadanQ(q)).map(q => q.id);   // 暗算・多段は1段の日に出ないので、出せる問題だけで見る（2026-10-25）
    const mk = (id, r, ago) => ({ r, t: now - ago * day });
    const daily = { sheets: [{ id: "x", date: "2000-01-01", at: 0, ids: ids.slice(0, 6), marks: {
      [ids[10]]: mk(ids[10], "✕", 1), [ids[11]]: mk(ids[11], "△", 1), [ids[12]]: mk(ids[12], "◎", 30), [ids[13]]: mk(ids[13], "◎", 1) } }] };
    return { daily, ids, pick4: pickDaily(4, [], now, daily), pickU: pickDaily(6, ["生物"], now, daily) };
  });
  ok(sel.pick4.includes(sel.ids[10]) && sel.pick4.includes(sel.ids[11]), "✕と△の問題は先に入る");
  ok(!sel.pick4.includes(sel.ids[13]), "昨日◎の問題は入らない");
  const u2 = await page.evaluate(p => p.map(id => QA_DATA.find(q => q.id === id).u), sel.pickU);
  ok(u2.filter(u => /生物/.test(u)).length >= 2, "優先する単元（生物）が入る", JSON.stringify(u2));
  const cap = await page.evaluate(() => { const n = Date.now(); const ids = pickDaily(6, [], n, { sheets: [] }); const c = {}; ids.forEach(id => { const u = QA_DATA.find(q => q.id === id).u; c[u] = (c[u]||0)+1; }); return c; });
  ok(Math.max(...Object.values(cap)) <= 3, "6問のとき同じ単元は3問まで", JSON.stringify(cap));
  const stable = await page.evaluate(() => JSON.stringify(pickDaily(4, [], Date.now(), { sheets: [] })) === JSON.stringify(pickDaily(4, [], Date.now(), { sheets: [] })));
  ok(stable, "同じ条件なら同じ選び方（毎回ばらばらにならない）");
  // 壊れた記録は捨てずに別の名前で残す
  await page.evaluate(() => localStorage.setItem("keisan_daily_v1", "{こわれた"));
  await page.evaluate(() => dailyLoad());
  ok(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("keisan_daily_v1_corrupt_"))), "読めない記録は消さずに別の名前で残す");
  await ctx.close();

  // ============ 3. 鍵あり: 送信 ============
  console.log("[3] 鍵あり: 送信（偽の GitHub）");
  mock.files = {}; mock.log = []; mock.mode = "ok"; mock.plan = { units: ["てこ", "中和"], count: 5, tadan: { count: 1, day_every: 0 } };
  ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  page = await newPage(ctx);
  await setCfg(page, { token: TOKEN, api: API, repo: "owner/repo" });
  await page.reload();
  await page.waitForFunction(() => /てこ/.test(document.getElementById("daily-plan-note").textContent));
  ok(true, "plan/keisan.json を読んで「優先する単元」に出た");
  ok(mock.log.some(l => l.path === "plan/keisan.json" && l.auth === "Bearer " + TOKEN), "鍵つきで plan を読んだ");
  await page.click("#daily-print-btn");
  await page.waitForFunction(() => window.__printed === 1);
  d = await page.evaluate(() => JSON.parse(localStorage.getItem("keisan_daily_v1")));
  ok(d.sheets[0].ids.length === 5, "plan の count=5 が既定になる（多段の日なし）");
  const dk = d.sheets[0].date, sid = d.sheets[0].id;
  await page.click("#daily-marks-btn");
  await page.click('.mk-sheet[open] .mk-row:nth-of-type(1) .mk-btn[data-r="◎"]');
  await page.waitForFunction(() => true);
  await new Promise(r => setTimeout(r, 800));
  const p1 = "keisan/session/" + dk + "/" + sid + ".json";
  ok(!!mock.files[p1], "◎をつけたら " + p1 + " に送られた", Object.keys(mock.files).join(","));
  if(mock.files[p1]){
    const b = mockBody(p1);
    ok(b.app === "keisan" && b.q.length === 1 && b.q[0].r === "◎" && b.q[0].id === d.sheets[0].ids[0], "送った中身（app・問題id・◎）");
    ok(!/なまえ|名前/.test(JSON.stringify(b)), "名前は送らない");
  }
  ok(!mock.log.some(l => l.method === "PUT" && l.auth !== "Bearer " + TOKEN), "鍵は Bearer で送る");
  await page.click('.mk-sheet[open] .mk-row:nth-of-type(1) .mk-btn[data-r="✕"]');
  await new Promise(r => setTimeout(r, 800));
  ok(mock.files[p1] && mockBody(p1).q[0].r === "✕", "付け直すと同じファイルが上書きされる（sha つき）");
  ok(mock.log.filter(l => l.method === "PUT" && l.path === p1).length === 2, "二重にはためない（PUT は付けた回数ぶんだけ）");
  // 送れないとき: ためて、あとで送る
  mock.mode = "fail503";
  await page.click('.mk-sheet[open] .mk-row:nth-of-type(2) .mk-btn[data-r="△"]');
  await new Promise(r => setTimeout(r, 800));
  ok(/まだ送れていない記録: 1件/.test(await page.textContent("#send-status")), "送れなかった分は端末にためている");
  mock.mode = "ok";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await new Promise(r => setTimeout(r, 1000));
  ok(mock.files[p1] && mockBody(p1).q.length === 2, "つながったら、ためた分が送られた");
  ok(/まだ送れていない記録: 0件/.test(await page.textContent("#send-status")), "送れたらためた分は空になる");
  // 鍵がだめ（401）
  mock.mode = "auth401";
  await page.click('.mk-sheet[open] .mk-row:nth-of-type(3) .mk-btn[data-r="◎"]');
  await new Promise(r => setTimeout(r, 800));
  await page.click("#marks-back-link");
  ok(await page.isVisible("#send-auth-warn"), "401 のときは「鍵を作り直して」を出す");
  d = await page.evaluate(() => JSON.parse(localStorage.getItem("keisan_daily_v1")));
  ok(Object.keys(d.sheets[0].marks).length === 3, "送れなくても、端末の記録は消えない");
  await page.screenshot({ path: path.join(OUT, "04_送信_鍵エラー.png"), fullPage: true });
  mock.mode = "ok";
  // 鍵を空にして保存すると、もう送らない
  await page.fill("#send-token", "");
  await page.click("#send-save-btn");
  await page.click("#daily-marks-btn");
  const nBefore = mock.log.length;
  await page.click('.mk-sheet[open] .mk-row:nth-of-type(1) .mk-btn[data-r="△"]');
  await new Promise(r => setTimeout(r, 800));
  ok(mock.log.length === nBefore, "鍵を空にして保存したら、もう送らない");
  ok(await page.evaluate(() => localStorage.getItem("keisan_send_gh_v1")) === null, "鍵は端末から消えた");
  // 鍵はコードに無い
  ok(!/github_pat_[A-Za-z0-9_]{10,}/.test(fs.readFileSync(path.join(ROOT, "index.html"), "utf8")), "index.html に鍵が書かれていない");
  await ctx.close();

  // ============ 4. 検査用の差しかえは localhost のときだけ ============
  console.log("[4] api 差しかえは localhost のときだけ");
  mock.log = [];
  ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  page = await newPage(ctx);
  const seen = [];
  await ctx.route("https://api.github.com/**", r => { seen.push(r.request().url()); r.fulfill({ status: 201, contentType: "application/json", body: "{}", headers: { "Access-Control-Allow-Origin": "*" } }); });
  await ctx.route("http://evil.example/**", r => { seen.push("EVIL " + r.request().url()); r.fulfill({ status: 201, body: "{}" }); });
  await setCfg(page, { token: TOKEN, api: "http://evil.example", repo: "evil/repo" });
  await page.reload();
  await page.click("#daily-print-btn");
  await page.waitForFunction(() => window.__printed === 1);
  await page.click("#daily-marks-btn");
  await page.click('.mk-sheet[open] .mk-row:nth-of-type(1) .mk-btn[data-r="◎"]');
  await new Promise(r => setTimeout(r, 800));
  ok(!seen.some(u => u.startsWith("EVIL")), "localhost 以外の api は無視する（鍵をよそに送らない）", JSON.stringify(seen));
  ok(seen.some(u => u.startsWith("https://api.github.com/repos/nambanamba/kosuke-records/contents/keisan/session/")), "かわりに api.github.com の kosuke-records に送る", JSON.stringify(seen));
  await ctx.close();


  // ============ 6. 第6回の取り込みと、plan の新しい書き方 ============
  console.log("[6] 第6回・exclude_levels・単元ごとの数");
  ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  page = await newPage(ctx);
  const r6 = await page.evaluate(async () => {
    const q = id => QA_DATA.find(d => d.id === id);
    const imgOk = f => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth > 0); i.onerror = () => r(false); i.src = "images/" + f; });
    const lv = QA_DATA.slice(77, 82).map(d => d.level).join();
    const now = Date.now(), none = { sheets: [] };
    const A = pickDaily(4, [{ name: "呼吸・循環", count: 3 }, { name: "てこ", count: 1 }], now, none, null, []);
    const B = pickDaily(4, [{ name: "呼吸・循環", count: 3 }, { name: "てこ", count: 1 }], now, none, null, ["発展"]);
    const C = pickDaily(4, ["呼吸・循環"], now, none, null, ["発展"]);
    const D = pickDaily(6, [], now, none, null, ["発展"]);
    const cl = JSON.stringify(planClean({ units: [{ name: "てこ", count: 1 }, "中和", { bad: 1 }], exclude_levels: ["発展", 3, ""], count: 4 }));
    const un = id => (q(id) || {}).u;
    const E = pickDaily(4, [{ name: "物の燃焼", count: 4 }], now, none, null, []);
    const r7img = [await imgOk("r7c_01.jpg"), await imgOk("r7c_02.jpg")];
    return { E, r7img, imgs: [await imgOk("r6c_01.jpg"), await imgOk("r6c_02.jpg")], img12: [q("r6c01").img, q("r6c02").img, q("r6c03").img], lv, A, B, C, D, cl,
      aU: A.map(un), bU: B.map(un), lvOf: id => 0 };
  });
  ok(r6.E.length === 4 && r6.E.every(id => /^r7c/.test(id)), "units に 物の燃焼×4 と書けば今日のプリントに第7回が入る", JSON.stringify(r6.E));
  ok(r6.r7img[0] && r6.r7img[1], "第7回の図2枚が読める（r7c_01・r7c_02）");
  ok(r6.imgs[0] && r6.imgs[1] && r6.img12[0] === "r6c_01.jpg" && r6.img12[1] === "r6c_02.jpg" && !r6.img12[2], "第6回の図2枚が読める（r6c01・r6c02）。r6c03〜05 は図なし");
  ok(r6.lv === "標準,標準,発展,発展,発展", "r6c03〜05 は level 発展", r6.lv);
  ok(r6.A.filter(id => /^r6c/.test(id)).length === 3 && r6.A.filter(id => /^r[12]c/.test(id) && !/^r6c/.test(id)).length === 1, "units に数を書くと、呼吸・循環3問＋てこ1問になる", JSON.stringify(r6.aU));
  ok(r6.B.every(id => !["r6c03","r6c04","r6c05"].includes(id)), "exclude_levels=[発展] なら発展の問題は自動で選ばれない", JSON.stringify(r6.B));
  ok(r6.B.includes("r6c01") && r6.B.includes("r6c02") && r6.B.length === 4, "発展を除いても、残りの呼吸・循環2問と、ほかで4問になる", JSON.stringify(r6.B));
  ok(r6.C.includes("r6c01") && r6.C.length === 4, "文字列の配列の units も今までどおり読める", JSON.stringify(r6.C));
  ok(r6.D.length === 6 && !r6.D.some(id => ["r6c03","r6c04","r6c05"].includes(id)), "単元の指定が無くても exclude_levels は効く");
  const cl = JSON.parse(r6.cl);
  ok(cl.units.length === 2 && cl.units[0].name === "てこ" && cl.units[0].count === 1 && cl.units[1].count === 0 && cl.excludeLevels.join() === "発展" && cl.count === 4, "planClean: 文字列も {name,count} も読み、壊れた項目は捨てる", r6.cl);
  // 手で選ぶのは可（今までの画面では発展も出せる）
  ok(await page.evaluate(() => buildCalcPool(6, 6, false).length) === 5, "手で選ぶ画面（第6回の範囲）では5問とも出せる");
  await ctx.close();

  // plan を鍵つきで読んで、画面と選び方に出る
  mock.files = {}; mock.log = []; mock.mode = "ok";
  mock.plan = { units: [{ name: "呼吸・循環", count: 3 }, { name: "てこ", count: 1 }], exclude_levels: ["発展"], count: 4, tadan: { count: 1, day_every: 0 } };
  ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  page = await newPage(ctx);
  await setCfg(page, { token: TOKEN, api: API, repo: "owner/repo" });
  await page.reload();
  await page.waitForFunction(() => /呼吸/.test(document.getElementById("daily-plan-note").textContent));
  ok(/呼吸・循環×3/.test(await page.textContent("#daily-plan-note")) && /発展/.test(await page.textContent("#daily-plan-note")), "画面に「呼吸・循環×3、てこ×1／自動では出さない：発展」と出る", await page.textContent("#daily-plan-note"));
  await page.click("#daily-print-btn");
  await page.waitForFunction(() => window.__printed === 1);
  d = await page.evaluate(() => JSON.parse(localStorage.getItem("keisan_daily_v1")));
  ok(d.sheets[0].ids.length === 4 && d.sheets[0].ids.every(id => !["r6c03","r6c04","r6c05"].includes(id)) && d.sheets[0].ids.includes("r6c01"), "今日のプリントに発展は入らず、第6回の標準が入る", JSON.stringify(d.sheets[0].ids));
  await ctx.close();

  // ============ 5. 印刷の見本 ============
  console.log("[5] 印刷の見本（A4・印刷用の表示）");
  mock.mode = "ok"; mock.plan = null;
  ctx = await browser.newContext({ viewport: { width: 794, height: 1123 } });
  page = await newPage(ctx);
  await page.click("#daily-print-btn");
  await page.waitForFunction(() => window.__printed === 1);
  await page.waitForFunction(() => Array.from(document.querySelectorAll("#print-region img")).every(i => i.complete));
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: path.join(OUT, "今日のプリント_見本.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  const H = 1123;
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const aTop = await page.evaluate(() => document.querySelector("#print-region .print-answers").getBoundingClientRect().top + window.scrollY);
  ok(aTop % 1 < 1 && aTop > 0, "答えの面の位置を測れた（" + Math.round(aTop) + "px）");
  const pages = Math.ceil(total / H);
  for(let i = 0; i < pages && i < 8; i++){
    await page.screenshot({ path: path.join(OUT, "印刷_p" + (i + 1) + ".png"), clip: { x: 0, y: i * H, width: 794, height: Math.min(H, total - i * H) }, fullPage: true });
  }
  const pdfSize = fs.statSync(path.join(OUT, "今日のプリント_見本.pdf")).size;
  ok(pdfSize > 10000, "PDF が出た（" + pdfSize + " bytes）");
  const pdfPages = (fs.readFileSync(path.join(OUT, "今日のプリント_見本.pdf")).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log("  PDF のページ数: " + pdfPages);
  await ctx.close();


  // ============ 7. 多段の1問（2026-10-19）============
  console.log("[7] 多段の選び方（2段のグループ・3段以上のグループ。kind なしは両方）");
  {
    ctx = await browser.newContext({ viewport: { width: 794, height: 1123 } });
    page = await newPage(ctx);
    const r = await page.evaluate(() => {
      const none = { sheets: [] };
      const days = [];
      for(let k = 0; k < 30; k++){
        const now = Date.parse("2026-10-20T09:00:00+09:00") + k * 86400000;
        const reg = pickDaily(4, [{ name: "ばね・浮力・圧力", count: 2 }, { name: "物の燃焼", count: 1 }, { name: "てこ", count: 1 }], now, none, null, ["発展"]);
        const t = pickTadan({ count: 1, main: "ばね・浮力・圧力", mix: "物の燃焼", mix_every: 3 }, now, none, null);
        days.push({ reg, t, again: JSON.stringify(pickTadan({ count: 1, main: "ばね・浮力・圧力", mix: "物の燃焼", mix_every: 3 }, now, none, null)) === JSON.stringify(t) });
      }
      const lvOf = id => QA_DATA.find(d => d.id === id).level;
      // ✕ の多段は同じ単元の中で先に出る
      const dk = dayKeyOf(Date.parse("2026-10-20T09:00:00+09:00"));
      const withX = { sheets: [{ id: "x", date: "2026-10-01", at: 1, ids: ["r8d04"], marks: { r8d04: { r: "✕", t: Date.parse("2026-10-18T00:00:00+09:00") } } }] };
      const tx = pickTadan({ count: 1, main: "ばね・浮力・圧力" }, Date.parse("2026-10-20T09:00:00+09:00"), withX, null);
      const redo = pickTadan({ count: 1, main: "ばね・浮力・圧力" }, Date.parse("2026-10-20T09:00:00+09:00"), none, ["r8d04"]);
      const off = pickTadan({ count: 0 }, Date.now(), none, null);
      const dflt = pickTadan(null, Date.now(), none, null);
      const pc = planClean({ units: ["てこ"], count: 4, exclude_levels: ["発展"], tadan: { count: 1, main: "ばね・浮力・圧力", mix: "物の燃焼", mix_every: 3 } });
      const multi = QA_DATA.filter(d => d.level === "多段");
      const danOk = days.every(x => x.t.length === 3 && x.t.every(id => isTadanQ(QA_DATA.find(d => d.id === id))) && tadanDan(x.t[0]) === 2 && tadanDan(x.t[1]) === 2 && tadanDan(x.t[2]) === 3 && x.t[0] !== x.t[1]);
      const nDan2 = multi.filter(d => tadanDan(d.id) === 2).map(d => d.id).join(), unknownDan = multi.filter(d => !(d.id in TADAN_DAN)).map(d => d.id);
      return { days, tadanOnly: danOk, nDan2, unknownDan, regNone: days.every(x => x.reg.every(id => !isTadanQ(QA_DATA.find(d => d.id === id)))), moved: ["r7c06", "r7c07", "r7c10", "r7c11", "r8c14"].every(id => isTadanQ(QA_DATA.find(d => d.id === id)) && tadanDan(id) === 3),
        kai8: days.filter(x => x.t[2].startsWith("r8")).length, kai7: days.filter(x => x.t[2].startsWith("r7")).length, stable: days.every(x => x.again), tx, redo, off, dflt: dflt.length, pc, nMulti: multi.length,
        noteLeak: multi.filter(d => d.a && d.note.indexOf(d.a.split("　")[0]) >= 0).map(d => d.id), ex: days.slice(0,3) };
    });
    ok(r.nMulti === 16, "多段は16問（第7回5・第8回9・第9回2）");
    ok(r.tadanOnly, "多段は毎日3問: 2段・2段（ちがう問題）・3段以上の順・level=多段");
    ok(r.nDan2 === "r8d01,r8d02,r8d03,r8d04,r8d08,r8d09,r9d01" && r.unknownDan.length === 0, "段数の仕分け: 2段は r8d01〜04・08・09・r9d01、ほかは3段以上（16問すべてに印）", r.nDan2 + " / 印なし " + r.unknownDan.join());
    ok(r.regNone, "ふだんの4問に多段（多段として出す5問も）は入らない（exclude_levels に書かなくても）");
    ok(r.moved, "r7c06・07・10・11・r8c14 は3段以上の多段として出す");
    ok(r.kai8 > r.kai7 && r.kai7 >= 8 && r.kai7 <= 12, "3段以上の1問: 今週(第8回)が中心・3日に1日だけ第7回（30日で第8回" + r.kai8 + "・第7回" + r.kai7 + "）");
    ok(r.stable, "同じ日は同じ問題");
    ok(r.tx[0] === "r8d04", "前回✕の多段が先に出る", JSON.stringify(r.tx));
    ok(r.redo.indexOf("r8d04") < 0, "選び直しでは別の多段が出る", JSON.stringify(r.redo));
    ok(r.off.length === 0 && r.dflt === 3, "count=0 なら出ない・plan が読めなければ既定3問（2段2＋3段以上1）");
    ok(r.pc.tadan && r.pc.tadan.count === 1 && r.pc.tadan.main === "ばね・浮力・圧力" && r.pc.tadan.mix === "物の燃焼" && r.pc.tadan.mix_every === 3, "planClean: tadan を読む");
    ok(r.noteLeak.length === 0, "多段の note に答えが出ていない（出典だけ）", r.noteLeak.join());
    console.log("  例（3日ぶん）: " + JSON.stringify(r.ex));
    // 日をあけて同じ多段を3回（2026-10-24）: ◎のあと3日・7日あけてもう一度。✕は先。◎3回で卒業
    {
      const rr = await page.evaluate(() => {
        const T = s => Date.parse(s + "T09:00:00+09:00");
        // ★2026-10-24〜「まだ」が出し直しより先。出し直しを見るため、第8回のほかの3段以上（r8d05・r8d07・r8c14）は前に◎3回で卒業させておく
        const GRAD = ["2026-10-01", "2026-10-02", "2026-10-03"].map((day, j) => ({ id: "g" + j, date: day, at: T(day), ids: ["r8d05", "r8d07", "r8c14"], marks: { r8d05: { r: "◎", t: T(day) }, r8d07: { r: "◎", t: T(day) }, r8c14: { r: "◎", t: T(day) } } }));
        const mk = (marks, noGrad) => ({ sheets: (noGrad ? [] : GRAD).concat(marks.map((m, i) => ({ id: "s" + i, date: m[0], at: T(m[0]), ids: ["r8d06"], marks: { r8d06: { r: m[1], t: T(m[0]) } } }))) });
        const pick = (marks, day, noGrad) => pickTadan({ count: 1, main: "ばね・浮力・圧力" }, T(day), mk(marks, noGrad), null, "dan3")[0];   // r8d06 は3段以上
        const one = [["2026-10-20", "◎"]], two = [["2026-10-20", "◎"], ["2026-10-23", "◎"]], three = two.concat([["2026-10-30", "◎"]]);
        return {
          d1: pick(one, "2026-10-21"), d3: pick(one, "2026-10-23"), mada: pick(one, "2026-10-23", true),
          e4: pick(two, "2026-10-27"), e7: pick(two, "2026-10-30"),
          g3: pick(three, "2026-11-02"), g7: pick(three, "2026-11-06"),
          x: pick([["2026-10-20", "◎"], ["2026-10-22", "✕"]], "2026-10-23"),
          xr: pick([["2026-10-20", "✕"], ["2026-10-22", "◎"]], "2026-10-24"), xr2: pick([["2026-10-20", "✕"], ["2026-10-22", "◎"]], "2026-10-25"),
          rank: [tadanReviewRank([{ t: 0, r: "◎" }], 3 * 86400000), tadanReviewRank([{ t: 0, r: "◎" }], 1 * 86400000), tadanReviewRank([{ t: 0, r: "◎" }, { t: 1, r: "◎" }, { t: 2, r: "◎" }], 8 * 86400000)]
        };
      });
      ok(rr.d1 !== "r8d06" && rr.d3 === "r8d06", "1回目の◎: 1日後は出ない・3日後にもう一度", JSON.stringify(rr));
      ok(rr.mada !== "r8d06" && /^r8/.test(rr.mada), "まだ出していない問題があれば、出し直しより先に出す", JSON.stringify(rr.mada));
      ok(rr.e4 !== "r8d06" && rr.e7 === "r8d06", "2回目の◎: 4日後は出ない・7日後にもう一度", JSON.stringify(rr));
      ok(rr.g3 !== "r8d06" && rr.g7 !== "r8d06", "◎3回で卒業: まだの問を先に出す", JSON.stringify(rr));
      ok(rr.x === "r8d06", "◎のあと✕なら先に出る");
      ok(rr.xr !== "r8d06" && rr.xr2 === "r8d06", "✕のあとの◎から数えなおし（3日あける）", JSON.stringify(rr));
      ok(rr.rank[0] === 2.5 && rr.rank[1] === 5 && rr.rank[2] === 3, "tadanReviewRank の値", JSON.stringify(rr.rank));
    }
    // 実物で、プリントに多段が1問入り、答えの面に解き方が出る
    mock.mode = "ok"; mock.plan = { units: [{ name: "ばね・浮力・圧力", count: 2 }, { name: "物の燃焼", count: 1 }, { name: "てこ", count: 1 }], exclude_levels: ["発展"], count: 4, tadan: { count: 1, main: "ばね・浮力・圧力", mix: "物の燃焼", mix_every: 3 } };
    await page.evaluate(() => { localStorage.setItem("keisan_send_cfg_v1", ""); });
    await ctx.close();
  }


  // ============ 8. 日替わり（2026-10-24）: 1段の日＝4問／2段の日＝2段2問／3段以上の日＝3段以上1問 ============
  console.log("[8] 日替わり: 1段の日4問 → 2段の日2問 → 3段以上の日1問");
  {
    ctx = await browser.newContext({ viewport: { width: 794, height: 1123 } });
    page = await newPage(ctx);
    const r = await page.evaluate(() => {
      const t = { count: 1, main: "ばね・浮力・圧力", mix: "物の燃焼", mix_every: 3, day_every: 2 };   // 今の本番 plan（day_every:2）でも日替わりになる
      const base = Date.parse("2026-10-23T09:00:00+09:00");
      const days = [];
      for(let k = 0; k < 9; k++){
        const now = base + k * 86400000;
        const kind = tadanDayKind(t, now);
        const ids = kind !== "normal" ? pickTadan(t, now, { sheets: [] }, null, kind) : pickDaily(4, [{ name: "ばね・浮力・圧力", count: 2 }, { name: "物の燃焼", count: 1 }, { name: "てこ", count: 1 }], now, { sheets: [] }, null, ["発展"]);
        days.push({ date: dayKeyOf(now), kind, ids, same: tadanDayKind(t, now) === kind, dans: ids.map(id => isTadanQ(QA_DATA.find(d => d.id === id)) ? tadanDan(id) : 1) });
      }
      const cnt = ev => { let n = 0; for(let k = 0; k < 27; k++) if(isTadanDay({ day_every: ev }, base + k * 86400000)) n++; return n; };
      return { days, c1: cnt(1), c2: cnt(2), c0: cnt(0), dflt: cnt(undefined), off: tadanDayKind({ count: 0 }, base), pc: planClean({ tadan: { count: 1, day_every: 3 } }).tadan.day_every, pcd: planClean({ tadan: { count: 1 } }).tadan.day_every,
        pcc: planClean({ tadan: { count: 1 } }).tadan, pcc2: planClean({ tadan: { count: 1, count2: 3, count3: 2 } }).tadan };
    });
    r.days.forEach(x => console.log("  " + x.date + " " + x.kind + " " + x.ids.join(",")));
    const seq = r.days.map(x => x.kind).join();
    ok(r.days.every((x, i) => i < 3 || x.kind === r.days[i-3].kind) && new Set(r.days.slice(0, 3).map(x => x.kind)).size === 3, "3種類が3日ごとに回る", seq);
    ok(r.days.every((x, i) => i === 0 || ["normal", "dan2", "dan3"].indexOf(x.kind) === (["normal", "dan2", "dan3"].indexOf(r.days[i-1].kind) + 1) % 3), "順は 1段 → 2段 → 3段以上", seq);
    ok(r.days.every(x => x.kind === "normal" ? x.ids.length === 4 && x.dans.every(n => n === 1) : x.kind === "dan2" ? x.ids.length === 2 && x.dans.every(n => n === 2) && x.ids[0] !== x.ids[1] : x.ids.length === 1 && x.dans[0] === 3), "1段の日は4問（多段なし）・2段の日は2段2問・3段以上の日は1問", JSON.stringify(r.days.map(x => x.dans)));
    ok(r.days.every(x => x.same), "同じ日は何度でも同じ判定");
    ok(r.c1 === 18 && r.c2 === 18 && r.c0 === 0 && r.dflt === 18 && r.off === "normal", "day_every 0 と count 0 のときだけ多段の日なし／それ以外は27日中18日が多段の日", JSON.stringify([r.c1, r.c2, r.c0, r.dflt, r.off]));
    ok(r.pc === 3 && r.pcd === 1 && r.pcc.count2 === 2 && r.pcc.count3 === 1 && r.pcc2.count2 === 3 && r.pcc2.count3 === 2, "planClean: day_every・count2・count3 を読む（無ければ 1・2・1）");
    await ctx.close();
    // 実物: 2段の日・3段以上の日の紙（今の本番 plan の形）
    mock.mode = "ok"; mock.plan = { units: [{ name: "ばね・浮力・圧力", count: 2 }, { name: "物の燃焼", count: 1 }, { name: "てこ", count: 1 }], exclude_levels: ["発展", "多段"], count: 4, tadan: { count: 1, main: "ばね・浮力・圧力", mix: "物の燃焼", mix_every: 3, day_every: 2 } };
    for(const [kn, kind] of [[1, "dan2"], [2, "dan3"]]){
      mock.files = {}; mock.log = [];
      ctx = await browser.newContext({ viewport: { width: 794, height: 1123 } });
      page = await newPage(ctx, { offset: offsetFor(kn) });
      await setCfg(page, { token: TOKEN, api: API, repo: "owner/repo" });
      await page.reload();
      await page.click("#daily-print-btn");
      await page.waitForFunction(() => window.__printed === 1);
      await page.waitForFunction(() => Array.from(document.querySelectorAll("#print-region img")).every(i => i.complete));
      const dd = await page.evaluate(() => JSON.parse(localStorage.getItem("keisan_daily_v1")));
      const ids = dd.sheets[0].ids;
      const dans = await page.evaluate(ids => ids.map(id => tadanDan(id)), ids);
      const mixDay = await page.evaluate(() => hashStr(dayKeyOf(Date.now())) % 3 === 0);
      if(kind === "dan2") ok(ids.length === 2 && dans.every(n => n === 2) && ids.every(id => /^r8d/.test(id)), "2段の日: 2段の多段2問だけの紙", JSON.stringify(ids));
      else ok(ids.length === 1 && dans[0] === 3 && (mixDay ? /^r7/ : /^r8/).test(ids[0]) && (await page.evaluate(id => isTadanQ(QA_DATA.find(d => d.id === id)), ids[0])), "3段以上の日: 3段以上の1問だけの紙（" + (mixDay ? "まぜる日なので第7回" : "今週の第8回") + "）", JSON.stringify(ids));
      await page.emulateMedia({ media: "print" });
      const pdfName = kind === "dan2" ? "2段の日_見本.pdf" : "3段以上の日_見本.pdf";
      await page.pdf({ path: path.join(OUT, pdfName), format: "A4", printBackground: true, preferCSSPageSize: true });
      const pp = (fs.readFileSync(path.join(OUT, pdfName)).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
      ok(pp >= 2 && pp <= (kind === "dan2" ? 4 : 2), pdfName + " のページ数", "ページ数 " + pp); console.log("  " + pdfName + " のページ数: " + pp);
      ok(/日替わり/.test(await page.evaluate(() => document.getElementById("daily-plan-note").textContent)), "画面に「日替わり」の指定が出る");
      await ctx.close();
    }
  }

  // ============ 9. 暗算の問題は1段の日に出さない（2026-10-25 ユーザー決定「暗算はカード・紙が要るものだけ1段の日」）============
  console.log("[9] 1段の日: 暗算の52問は出さない・紙の問題だけ");
  {
    ctx = await browser.newContext({ viewport: { width: 794, height: 1123 } });
    page = await newPage(ctx);
    const PAPER = "r2c07,r2c12,r2c28,r2c29,r2c30,r2c32,r2c33,r2c36,r2c38,r2c39,r2c40,r2c41,r2c43,r2c44,r2c45,r2c47,r2c49,r2c50,r2c51,r2c52,r2c64,r7c03,r7c05,r7c08,r7c09,r8c02,r8c03,r8c04,r8c07,r8c08";
    const r = await page.evaluate(PAPER => {
      const paper = PAPER.split(",");
      const anz = QA_DATA.filter(isAnzanQ).map(d => d.id);
      // 第2・7・8・9回の1段（多段・発展をのぞく）＝ 暗算＋紙
      const one = QA_DATA.filter(d => /^r[2789]c/.test(d.id) && !isTadanQ(d) && d.level !== "発展").map(d => d.id);
      const split = one.every(id => (anz.indexOf(id) >= 0) !== (paper.indexOf(id) >= 0)) && one.length === anz.length + paper.length;
      const perUnit = {}; paper.forEach(id => { const u = QA_DATA.find(d => d.id === id).u; perUnit[u] = (perUnit[u] || 0) + 1; });
      // 今の本番 plan の形で、1段の日を 30 回（毎回 全部◎にする）。暗算が1つも出ないか・単元ごとに何問・何回目で紙の問題が一巡するか
      const plans = {
        now: [{ name: "ばね・浮力・圧力", count: 2 }, { name: "物の燃焼", count: 1 }, { name: "てこ", count: 1 }],
        r9: [{ name: "流水と地層", count: 1 }, { name: "ばね・浮力・圧力", count: 2 }, { name: "物の燃焼", count: 1 }]
      };
      const out = {};
      Object.keys(plans).forEach(k => {
        const daily = { sheets: [] };
        const base = Date.parse("2026-10-26T07:00:00+09:00");
        const seen = {}, firstAll = {}, days = [];
        for(let n = 0; n < 30; n++){
          const now = base + n * 3 * 86400000;   // 1段の日は3日に1回
          const ids = pickDaily(4, plans[k], now, daily, null, ["発展", "多段"]);
          const marks = {}; ids.forEach(id => { marks[id] = { r: "◎", t: now }; seen[id] = 1; });
          daily.sheets.push({ id: dayKeyOf(now), date: dayKeyOf(now), at: now, ids: ids, marks: marks });
          days.push(ids);
          ["てこ", "物の燃焼", "ばね・浮力・圧力"].forEach(u => { const all = paper.filter(id => QA_DATA.find(d => d.id === id).u.indexOf(u) >= 0); if(!firstAll[u] && all.every(id => seen[id])) firstAll[u] = n + 1; });
        }
        const flat = [].concat.apply([], days);
        const cnt = {}; flat.forEach(id => { const u = QA_DATA.find(d => d.id === id).u.replace(/^第\d+回\./, ""); cnt[u] = (cnt[u] || 0) + 1; });
        out[k] = { days: days.slice(0, 6), four: days.every(x => x.length === 4), noAnz: flat.every(id => anz.indexOf(id) < 0), onlyPaper: flat.every(id => paper.indexOf(id) >= 0 || !/^r[2789]c/.test(id)), cnt, firstAll };
      });
      return { nAnz: anz.length, nPaper: paper.length, nOne: one.length, split, perUnit, out, kept: ["r2c01", "r7c02", "r8c13", "r9c01"].every(id => QA_DATA.some(d => d.id === id)) };
    }, PAPER);
    ok(r.nAnz === 52 && r.nPaper === 30 && r.split, "第2・7・8・9回の1段 " + r.nOne + "問 ＝ 暗算52 ＋ 紙30（重なり・もれなし）", JSON.stringify([r.nAnz, r.nPaper, r.nOne]));
    ok(r.kept, "暗算の問題もデータには残る（消していない）");
    console.log("  紙の問題の数: " + JSON.stringify(r.perUnit));
    ok(r.perUnit["第2回.てこ・滑車・輪軸"] === 21 && r.perUnit["第7回.物の燃焼"] === 4 && r.perUnit["第8回.ばね・浮力・圧力"] === 5 && !r.perUnit["第9回.流水と地層"], "紙はてこ21・燃焼4・ばね5・地層0");
    for(const k of Object.keys(r.out)){
      const o = r.out[k];
      console.log("  plan " + k + ": はじめの6回 " + o.days.map(x => x.join(",")).join(" / "));
      console.log("  plan " + k + ": 30回の内わけ " + JSON.stringify(o.cnt) + "／紙が一巡した回 " + JSON.stringify(o.firstAll));
      ok(o.four, "plan " + k + ": 1段の日は毎回4問そろう");
      ok(o.noAnz, "plan " + k + ": 暗算の問題は1度も出ない（30回）");
      ok(o.onlyPaper, "plan " + k + ": 第2・7・8・9回からは紙の問題だけ");
    }
    // 実物: 1段の日の紙（本番 plan の形）
    mock.mode = "ok"; mock.files = {}; mock.log = [];
    mock.plan = { units: [{ name: "ばね・浮力・圧力", count: 2 }, { name: "物の燃焼", count: 1 }, { name: "てこ", count: 1 }], exclude_levels: ["発展", "多段"], count: 4, tadan: { count: 1, main: "流水と地層", mix: "ばね・浮力・圧力", mix_every: 3, day_every: 1 } };
    await setCfg(page, { token: TOKEN, api: API, repo: "owner/repo" });
    await page.reload();
    await page.click("#daily-print-btn");
    await page.waitForFunction(() => window.__printed === 1);
    const dd = await page.evaluate(() => JSON.parse(localStorage.getItem("keisan_daily_v1")));
    const ids = dd.sheets[0].ids;
    ok(ids.length === 4 && (await page.evaluate(ids => ids.every(id => !isAnzanQ(QA_DATA.find(d => d.id === id)) && !isTadanQ(QA_DATA.find(d => d.id === id))), ids)), "実物: 1段の日の紙は4問・暗算なし", JSON.stringify(ids));
    await ctx.close();
  }

  await browser.close();
  staticSrv.close(); mockSrv.close();
  console.log("\n結果: PASS " + pass + " / FAIL " + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
