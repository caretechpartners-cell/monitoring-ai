import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const {
      memo,      // メモ全文
      aiResult   // AI生成文章（全文）
    } = req.body;

    /* ----------------------------
       ① テンプレート読み込み
    ---------------------------- */
    const templatePath = path.join(process.cwd(), "templates", "kaigiroku.xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const sheet = workbook.getWorksheet(1); // 最初のシート


    /* ----------------------------------------
       ★ 書式を壊さない値代入：set(cell, value)
    ---------------------------------------- */
    const set = (cell, value) => {
      const c = sheet.getCell(cell);
      c.value = value;   // フォント・罫線・結合などは維持される
    };


    /* ----------------------------
       ② メモから情報抽出
    ---------------------------- */

    // 作成年月日（今日）
    const today = new Date().toISOString().split("T")[0];
    set("M1", today);

    // 開催日
    const dateMatch = memo.match(/\d{4}\/\d{1,2}\/\d{1,2}/);
    if (dateMatch) set("B5", dateMatch[0]);

    // 開催時間
    const timeMatch = memo.match(/\d{1,2}:\d{2}〜\d{1,2}:\d{2}/);
    if (timeMatch) set("K5", timeMatch[0]);

    // 開催場所
    const placeMatch = memo.match(/場所[:：]\s*(.+)/);
    if (placeMatch) set("F5", placeMatch[1].trim());

    // 利用者名
    const nameMatch = memo.match(/利用者[:：]\s*([^\n]+)/);
    if (nameMatch) set("B3", nameMatch[1].trim());

    // 家族
    const family = memo.match(/家族[:：]\s*([^\n]+)/);
    if (family) {
      set("B11", "あり");
      set("B12", family[1].trim());
    }

    // 本人出席（簡易抽出）
    if (memo.includes("本人")) set("B10", "あり");


    /* ----------------------------
       ③ 参加者（最大9名）
    ---------------------------- */
    const members = memo.match(/参加者[:：]\s*([^\n]+)/);

    if (members) {
      const list = members[1].split("、");

      const target = [
        ["C8","E8"],["C10","E10"],["C12","E12"],
        ["G8","I8"],["G10","I10"],["G12","I12"],
        ["K8","M8"],["K10","M10"],["K12","M12"]
      ];

      list.forEach((item, i) => {
        if (i >= target.length) return;

        const m = item.match(/(.+?)（(.+?)）/); // 職種（氏名）
        if (m) {
          set(target[i][0], m[1]);
          set(target[i][1], m[2]);
        }
      });
    }


    /* ----------------------------
       ④ AI 出力内容の抽出
    ---------------------------- */
    const kadai = aiResult.match(/課題[\s\S]*?(?=今後|支援方針)/);
    const shien = aiResult.match(/(支援方針|今後)[\s\S]*/);
    const next = memo.match(/次回[:：]\s*([^\n]+)/);

    // 検討した項目
    if (kadai) set("C14", kadai[0].trim());

    // 検討内容（全文）
    set("C18", aiResult);

    // 会議の結論
    if (shien) set("C22", shien[0].trim());

    // 残された課題
    if (kadai) set("C27", kadai[0].trim());

    // 次回開催日
    if (next) set("C31", next[1].trim());


    /* ----------------------------
       ⑤ 生成して返す
    ---------------------------- */
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=議事録.xlsx");

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Excel生成エラー", detail: err.message });
  }
}
