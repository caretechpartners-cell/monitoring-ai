import ExcelJS from "exceljs";
import path from "path";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const {
      memo,
      aiResult,
      userName = "利用者",
      meetingDate = new Date().toISOString().split("T")[0]
    } = req.body;

    if (!memo || !aiResult) {
      return res.status(400).json({ error: "memo または aiResult が不足" });
    }

    /* ----------------------------
       ① テンプレート読み込み
    ---------------------------- */
    const templatePath = path.join(
      process.cwd(),
      "templates",
      "kaigiroku.xlsx"
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const sheet = workbook.getWorksheet(1);

    /* ----------------------------------------
       ★ 書式を壊さない値代入
    ---------------------------------------- */
    const set = (cell, value) => {
      sheet.getCell(cell).value = value;
    };

    /* ----------------------------
       ② メモから情報抽出
    ---------------------------- */

    // 作成年月日
    set("M1", meetingDate);

    // 利用者名
    set("B3", userName);

    // 開催日
    const dateMatch = memo.match(/\d{4}\/\d{1,2}\/\d{1,2}/);
    if (dateMatch) set("B5", dateMatch[0]);

    // 開催時間
    const timeMatch = memo.match(/\d{1,2}:\d{2}〜\d{1,2}:\d{2}/);
    if (timeMatch) set("K5", timeMatch[0]);

    // 開催場所
    const placeMatch = memo.match(/場所[:：]\s*(.+)/);
    if (placeMatch) set("F5", placeMatch[1].trim());

    // 本人出席
    if (memo.includes("本人")) set("B10", "あり");

    // 家族
    const familyMatch = memo.match(/家族[:：]\s*([^\n]+)/);
    if (familyMatch) {
      set("B11", "あり");
      set("B12", familyMatch[1].trim());
    }

    /* ----------------------------
       ③ 参加者（最大9名）
    ---------------------------- */
    const membersMatch = memo.match(/参加者[:：]\s*([^\n]+)/);

    if (membersMatch) {
      const list = membersMatch[1].split("、");

      const targets = [
        ["C8", "E8"], ["C10", "E10"], ["C12", "E12"],
        ["G8", "I8"], ["G10", "I10"], ["G12", "I12"],
        ["K8", "M8"], ["K10", "M10"], ["K12", "M12"]
      ];

      list.forEach((item, i) => {
        if (i >= targets.length) return;
        const m = item.match(/(.+?)（(.+?)）/);
        if (m) {
          set(targets[i][0], m[1]);
          set(targets[i][1], m[2]);
        }
      });
    }

    /* ----------------------------
       ④ AI出力内容
    ---------------------------- */
    const kadai = aiResult.match(/課題[\s\S]*?(?=今後|支援方針)/);
    const shien = aiResult.match(/(支援方針|今後)[\s\S]*/);
    const next = memo.match(/次回[:：]\s*([^\n]+)/);

    if (kadai) set("C14", kadai[0].trim());
    set("C18", aiResult);
    if (shien) set("C22", shien[0].trim());
    if (kadai) set("C27", kadai[0].trim());
    if (next) set("C31", next[1].trim());

    /* ----------------------------
       ⑤ 生成して返却
    ---------------------------- */

    const fileName = `${userName}_${meetingDate}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Excel生成エラー", detail: err.message });
  }
}
