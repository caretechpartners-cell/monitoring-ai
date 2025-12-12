import ExcelJS from "exceljs";
import path from "path";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { memo, aiResult } = req.body;

    if (!memo || !aiResult) {
      return res.status(400).json({ error: "memo または aiResult が不足しています" });
    }

    const templatePath = path.join(process.cwd(), "templates", "kaigiroku.xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const sheet = workbook.getWorksheet(1);

    const set = (cell, value) => {
      const c = sheet.getCell(cell);
      c.value = value;
    };

    const today = new Date().toISOString().split("T")[0];
    set("M1", today);

    const nameMatch = memo.match(/利用者[:：]\s*([^\n]+)/);
    if (nameMatch) set("B3", nameMatch[1].trim());

    const dateMatch = memo.match(/\d{4}\/\d{1,2}\/\d{1,2}/);
    if (dateMatch) set("B5", dateMatch[0]);

    const timeMatch = memo.match(/\d{1,2}:\d{2}〜\d{1,2}:\d{2}/);
    if (timeMatch) set("K5", timeMatch[0]);

    const placeMatch = memo.match(/場所[:：]\s*([^\n]+)/);
    if (placeMatch) set("F5", placeMatch[1].trim());

    if (memo.includes("本人")) set("B10", "あり");

    const family = memo.match(/家族[:：]\s*([^\n]+)/);
    if (family) {
      set("B11", "あり");
      set("B12", family[1].trim());
    }

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
        const m = item.match(/(.+?)（(.+?)）/);
        if (m) {
          set(target[i][0], m[1]);
          set(target[i][1], m[2]);
        }
      });
    }

    const kadai =
      aiResult.match(/課題[\s\S]*?(?=今後|支援方針)/) ||
      aiResult.match(/【課題】([\s\S]*?)【/) ||
      null;

    const shien =
      aiResult.match(/今後[\s\S]*/) ||
      aiResult.match(/支援方針[\s\S]*/) ||
      null;

    if (kadai) set("C14", kadai[0].trim());
    set("C18", aiResult);

    if (shien) set("C22", shien[0].trim());
    if (kadai) set("C27", kadai[0].trim());

    const next = memo.match(/次回[:：]\s*([^\n]+)/);
    if (next) set("C31", next[1].trim());

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    // ★★★ ここだけ修正（日本語禁止） ★★★
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=meeting.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Excel生成エラー",
      detail: err.message
    });
  }
}
