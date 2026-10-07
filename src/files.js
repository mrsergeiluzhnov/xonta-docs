// Временное хранилище готовых документов: файл доступен по ссылке FILE_TTL_HOURS часов (по умолчанию 24),
// потом удаляется. Ссылка содержит случайный идентификатор, по которому файл не угадать.
import { mkdir, writeFile, readdir, stat, unlink, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

const DIR = process.env.FILES_DIR || "/tmp/xonta-docs-files";
const TTL_MS = Number(process.env.FILE_TTL_HOURS ?? 24) * 3600 * 1000;
const TYPES = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
let publicUrl = "";
let ready;

export function initFiles(url) {
  publicUrl = url.replace(/\/$/, "");
  ready ??= mkdir(DIR, { recursive: true });
  setInterval(cleanup, 3600 * 1000).unref();
  return ready.then(cleanup);
}

export async function saveFile(buffer, ext, niceName) {
  await (ready ??= mkdir(DIR, { recursive: true }));
  const id = randomBytes(12).toString("hex");
  await writeFile(path.join(DIR, `${id}.${ext}`), buffer);
  return {
    format: ext,
    url: `${publicUrl}/files/${id}/${encodeURIComponent(niceName)}.${ext}`,
    size_bytes: buffer.length,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  };
}

async function cleanup() {
  try {
    const now = Date.now();
    for (const f of await readdir(DIR)) {
      const p = path.join(DIR, f);
      const s = await stat(p);
      if (now - s.mtimeMs > TTL_MS) await unlink(p).catch(() => {});
    }
  } catch {}
}

export function mountFiles(app) {
  app.get("/files/:id/:name", async (req, res) => {
    const { id, name } = req.params;
    const ext = (name.match(/\.(pdf|docx)$/) || [])[1];
    if (!/^[0-9a-f]{24}$/.test(id) || !ext) return res.status(404).json({ error: "Файл не найден" });
    try {
      const p = path.join(DIR, `${id}.${ext}`);
      const s = await stat(p);
      if (Date.now() - s.mtimeMs > TTL_MS) return res.status(410).json({ error: "Срок хранения файла истёк, сформируйте документ заново" });
      res.set({
        "Content-Type": TYPES[ext],
        "Content-Disposition": `attachment; filename="document.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, max-age=3600",
        "X-Robots-Tag": "noindex",
      });
      res.send(await readFile(p));
    } catch {
      res.status(404).json({ error: "Файл не найден или уже удалён" });
    }
  });
}
