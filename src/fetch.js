// Безопасная загрузка файла по публичной ссылке: запрещает внутренние адреса (SSRF),
// ограничивает размер и время, проверяет каждый редирект.
import dns from "node:dns";
import { Agent, fetch } from "undici";
import ipaddr from "ipaddr.js";

const MAX_BYTES = Number(process.env.MAX_BYTES || 10 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 20_000);

function isPublic(ip) {
  try {
    let a = ipaddr.parse(ip);
    if (a.kind() === "ipv6" && a.isIPv4MappedAddress()) a = a.toIPv4Address();
    return a.range() === "unicast";
  } catch { return false; }
}

// Validate the IP at connect time, so DNS rebinding can't sneak past.
const safeLookup = (hostname, options, cb) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const bad = addrs.find((a) => !isPublic(a.address));
    if (bad) return cb(Object.assign(new Error(`Внутренний адрес ${bad.address} запрещён`), { code: "EBLOCKED" }));
    if (options.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
};

const agent = new Agent({ connect: { lookup: safeLookup } });

export async function download(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { throw httpErr(400, "Некорректная ссылка"); }
  for (let hop = 0; hop < 5; hop++) {
    if (!["http:", "https:"].includes(url.protocol)) throw httpErr(400, "Поддерживаются только ссылки http(s)");
    if (ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, "")) && !isPublic(url.hostname.replace(/^\[|\]$/g, "")))
      throw httpErr(400, "Ссылки на внутренние адреса запрещены");
    let res;
    try {
      res = await fetch(url, {
        dispatcher: agent,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "XontaDocs/1.2 (+https://mcp.xonta.ru)", accept: "*/*" },
      });
    } catch (e) {
      const blocked = e?.cause?.code === "EBLOCKED";
      throw httpErr(blocked ? 400 : 502, blocked ? "Ссылки на внутренние адреса запрещены" : `Не удалось скачать файл: ${e.cause?.message || e.message}`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location"), url);
      continue;
    }
    if (!res.ok) throw httpErr(502, `Сайт вернул ошибку HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) throw httpErr(413, `Файл слишком большой (максимум ${Math.round(MAX_BYTES / 1048576)} МБ)`);
    const chunks = [];
    let size = 0;
    for await (const c of res.body) {
      size += c.length;
      if (size > MAX_BYTES) throw httpErr(413, `Файл слишком большой (максимум ${Math.round(MAX_BYTES / 1048576)} МБ)`);
      chunks.push(c);
    }
    return { buf: Buffer.concat(chunks), contentType: res.headers.get("content-type") || "", finalUrl: url.toString() };
  }
  throw httpErr(502, "Слишком много перенаправлений");
}

export function httpErr(status, message) {
  return Object.assign(new Error(message), { status });
}
