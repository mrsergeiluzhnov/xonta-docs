// Отправка адресов в IndexNow (Яндекс, Bing): node scripts/indexnow.js
// Нужны INDEXNOW_KEY и PUBLIC_URL (из .env). Файл ключа сервис отдаёт сам: /<ключ>.txt
import { TOOLS } from "../src/tools/index.js";
import { allUrls } from "../src/seo.js";
const key = process.env.INDEXNOW_KEY, base = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
if (!key || !base) { console.error("Задайте INDEXNOW_KEY и PUBLIC_URL"); process.exit(1); }
const body = { host: new URL(base).host, key, keyLocation: `${base}/${key}.txt`, urlList: allUrls(TOOLS, base) };
for (const ep of ["https://yandex.com/indexnow", "https://www.bing.com/indexnow"]) {
  const r = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  console.log(ep, r.status);
}
