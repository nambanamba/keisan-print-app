// 理科 第9回「流水と地層」の計算を data.js に追記し、図3枚を images/ に置く（2026-10-24）
// ユーザー決定（10-24）: 1回の計算（1段）は計算プリントの1段の日にも出す／多段は暗記カードを「低」にして計算プリントへ。段数は index.html の TADAN_DAN
//   1段: r9c01（演習69P まとめ2(3)⑱ 南に300m→15m）
//   多段: r9d01（理科88P 2(4) の例 E点30m・G点5m・2段）／r9d02（演習74P 練習4 問3 D点6.6m・3段以上）
//   ★10-24 レビュー: 練習4 問4（柱状図を選ぶ・旧 r9d03）は計算でないので外した（紙の大問には残る）
//   node tools/取り込み_第9回.js --check   … 何も書かずに、やることを表示
//   node tools/取り込み_第9回.js --apply   … data.js に追記・画像をコピー
// ★既存の問題には一切さわらない。元データ・画像は sha256 を照合してから読む（違えばまず開き直す。同期の遅れでも合わない）
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const APP = path.join(__dirname, "..");
const DIR = "G:/マイドライブ/四谷大塚/5年下/quiz_csv_理科/";
const SRCS = [DIR + "第9回_流水と地層_calc.json", DIR + "第9回_流水と地層_calc多段.json"];
const EXPECT = {
  [SRCS[0]]: "828773eb",
  [SRCS[1]]: "0c4e9d84",
  [DIR + "画像プレビュー/r9_04.jpg"]: "ae3ca3e7",
  [DIR + "画像プレビュー/r9d_01.jpg"]: "db4cc4c8",
  [DIR + "画像プレビュー/r9r_4.jpg"]: "d91ea618",
};
const IDS = ["r9c01", "r9d01", "r9d02"];
const DATA = path.join(APP, "data.js");
const apply = process.argv.includes("--apply");

const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
for (const [f, pre] of Object.entries(EXPECT)) {
  const s = sha(f);
  if (!s.startsWith(pre)) { console.error("★中止: sha256 が宣言と違います（開き直して再実行。それでも違えば相手に確認）\n  " + f + "\n  期待 " + pre + "… 実際 " + s); process.exit(1); }
  console.log("sha256 一致 " + pre + "  " + path.basename(f));
}
const src = SRCS.flatMap(f => JSON.parse(fs.readFileSync(f, "utf8")));
const dataText = fs.readFileSync(DATA, "utf8");
const QA_DATA = eval(dataText + "; QA_DATA");
const existingIds = new Set(QA_DATA.map(d => d.id));
console.log("元データ " + src.length + "件 / 既存 " + QA_DATA.length + "件");

const entries = src.map(o => {
  const e = { id: o.id, subj: o.subject, u: o.genre, q: o.q, note: o.note, a: o.a };
  if (o.file) e.img = o.file;
  e.kai = o.kai; e.kind = o.kind; e.sol = o.sol; e.priority = o.priority; e.level = o.level;
  return e;
});
const errs = [];
if (entries.map(e => e.id).join() !== IDS.join()) errs.push("id が想定と違う: " + entries.map(e => e.id).join());
for (const e of entries) {
  if (existingIds.has(e.id)) errs.push("id 衝突: " + e.id);
  if (/^r9d/.test(e.id) !== (e.level === "多段")) errs.push(e.id + ": level が id と合わない（r9d は多段・r9c は多段でない）");
  if (e.kind !== "calc") errs.push(e.id + ": kind が calc でない");
  for (const k of ["id", "subj", "u", "q", "note", "a", "kai", "kind", "sol", "priority", "level"]) if (e[k] === undefined || e[k] === "") errs.push(e.id + ": " + k + " が空");
  if (!e.img) errs.push(e.id + ": 図が無い");
  else if (!fs.existsSync(DIR + "画像プレビュー/" + e.img)) errs.push(e.id + ": 画像元が無い " + e.img);
}
if (errs.length) { console.error("★中止:\n  " + errs.join("\n  ")); process.exit(1); }
console.log("関門: 全通過");
if (!apply) { console.log("--check なので書き込みません"); process.exit(0); }

for (const e of entries) { const to = path.join(APP, "images", e.img); if (fs.existsSync(to)) { console.error("★中止: 画像がすでにある " + e.img); process.exit(1); } }
for (const e of entries) fs.copyFileSync(DIR + "画像プレビュー/" + e.img, path.join(APP, "images", e.img));
const block = entries.map(e => JSON.stringify(e, null, 1).split("\n").map(l => " " + l).join("\n") + ",").join("\n") + "\n";
const at = dataText.lastIndexOf("\n];");
if (at < 0) { console.error("★中止: data.js の末尾 '];' が無い"); process.exit(1); }
fs.writeFileSync(DATA, dataText.slice(0, at + 1) + block + dataText.slice(at + 1));
console.log("追記: " + entries.length + "件、画像 " + entries.length + "枚");
