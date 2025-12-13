import ExcelJS from "exceljs";
import path from "path";

function extractSection(text, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(
    `【${escaped}】([\\s\\S]*?)(?=【検討事項】|【検討内容】|【会議の結論】|【残された課題】|$)`
  );

  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { memo, aiResult } = req.body;

    if (!memo || !aiResult) {
      return res.status(400).json({ error: "memo または aiResult が不足" });
    }

    /* ----------------------------
       ① 利用者名・日付を memo から抽出
    ---------------------------- */

    let userName = ""; // ★ 修正点：未宣言だったため追加

    const explicitMatch = memo.match(/利用者[:：]\s*([^\n　]+)/);
    if (explicitMatch) {
      userName = explicitMatch[1].trim();
    }

    if (!userName) {
      const lines = memo.split("\n").map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        // 「山田太郎」「山田 太郎」「山田太郎 要介2」などを想定
        if (
          /^[一-龥]{2,4}\s*[一-龥]{2,4}/.test(line) &&
          !line.includes("参加") &&
          !line.includes("場所")
        ) {
          userName = line.split(/\s+/)[0];
          break;
        }
      }
    }

    if (!userName) {
      userName = "利用者";
    }

    const dateMatch = memo.match(/\d{4}\/\d{1,2}\/\d{1,2}/);
    const meetingDate = dateMatch
      ? dateMatch[0].replace(/\//g, "-")
      : new Date().toISOString().split("T")[0];

    /* ----------------------------
       ② テンプレート読み込み
    ---------------------------- */
    const templatePath = path.join(
      process.cwd(),
      "templates",
      "kaigiroku.xlsx"
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const sheet = workbook.getWorksheet(1);

    const set = (cell, value) => {
      sheet.getCell(cell).value = value;
    };

    /* ----------------------------
       ③ 値のセット（書式完全維持）
    ---------------------------- */

    set("M1", meetingDate);
    set("B3", userName);

    if (dateMatch) set("B5", dateMatch[0]);

    const timeMatch = memo.match(/\d{1,2}:\d{2}〜\d{1,2}:\d{2}/);
    if (timeMatch) set("K5", timeMatch[0]);

    const placeMatch = memo.match(/場所[:：]\s*(.+)/);
    if (placeMatch) set("F5", placeMatch[1].trim());

    if (memo.includes("本人")) set("B10", "あり");

    const familyMatch = memo.match(/家族[:：]\s*([^\n]+)/);
    if (familyMatch) {
      set("B11", "あり");
      set("B12", familyMatch[1].trim());
    }

    /* ----------------------------
       ④ 参加者
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
       ⑤ AI結果（見出し完全対応）
    ---------------------------- */

    const sectionKento = extractSection(aiResult, "検討事項");
    const sectionNaiyo = extractSection(aiResult, "検討内容");
    const sectionKetsuron = extractSection(aiResult, "会議の結論");
    const sectionKadai = extractSection(aiResult, "残された課題");

    if (sectionKento) set("C14", sectionKento);
    if (sectionNaiyo) set("C18", sectionNaiyo);
    if (sectionKetsuron) set("C22", sectionKetsuron);
    if (sectionKadai) set("C27", sectionKadai);

    /* ----------------------------
       ⑥ 出力（日本語ファイル名安全）
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
