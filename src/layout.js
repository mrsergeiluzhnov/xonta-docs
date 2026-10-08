// Общая разметка страниц: head с SEO-тегами, стили, верхнее меню и подвал.
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export const STYLE = `<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#57534e;--card:#fff;--line:#e7e5e4;--accent:#4f46e5;--code:#f5f5f4}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--card:#1c1917;--line:#292524;--accent:#a5b4fc;--code:#292524}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}h1{font-size:30px;line-height:1.2;margin:0 0 12px}
h2{font-size:20px;margin:36px 0 12px}p{margin:0 0 12px}.lead{color:var(--muted);font-size:18px}
.badges span{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 10px;margin:0 6px 6px 0;font-size:14px;color:var(--muted)}
.tool{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 12px}
.tool h3{margin:0 0 6px;font-size:17px}.tool code{font-size:13px}
pre{background:var(--code);border-radius:10px;padding:14px;overflow-x:auto;font-size:13px;margin:0 0 12px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}a{color:var(--accent)}footer{margin-top:48px;color:var(--muted);font-size:14px}
nav.top{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:14px;margin:0 0 28px;padding-bottom:12px;border-bottom:1px solid var(--line)}
nav.top b{margin-right:auto}.crumbs{font-size:14px;color:var(--muted);margin:0 0 14px}
ul.list{margin:0 0 12px;padding-left:20px}ul.list li{margin:0 0 6px}
textarea{width:100%;font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:12px;margin:0 0 8px}
button{background:var(--accent);color:var(--bg);border:0;border-radius:8px;padding:8px 18px;font-size:15px;cursor:pointer;margin:0 0 12px}
</style>`;

export function headTags({ title, description, url, publicUrl, ld = [] }) {
  const env = process.env;
  const verification = [
    env.YANDEX_VERIFICATION && `<meta name="yandex-verification" content="${esc(env.YANDEX_VERIFICATION)}">`,
    env.GOOGLE_VERIFICATION && `<meta name="google-site-verification" content="${esc(env.GOOGLE_VERIFICATION)}">`,
  ]
    .filter(Boolean)
    .join("\n");
  const jsonLd = ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n");
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Xonta Документы">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(publicUrl)}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
${verification}
${jsonLd}`;
}

export const topNav = () =>
  `<nav class="top"><b><a href="/">Xonta Документы</a></b><a href="/#tools">Инструменты</a><a href="/openapi.json">API</a><a href="/llms.txt">llms.txt</a><a href="https://xonta.ru">Маркетплейс ИИ-агентов Xonta</a></nav>`;

export const footer = () =>
  `<footer>Сделано командой <a href="https://xonta.ru">Xonta</a> — маркетплейса ИИ-агентов для бизнеса. Новости: <a href="https://t.me/xonta_live">Xonta Live</a>.</footer>`;
