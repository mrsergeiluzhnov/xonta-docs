// Набор «Русский текст»: проверка иностранных слов (подсказки к закону о русском языке),
// типограф и транслитерация. Всё работает локально.
import { createRequire } from "node:module";
import { initMorph } from "./decline.js";
import { CYR_STRONG, CYR_SOFT, LAT } from "./anglicisms.js";

const require = createRequire(import.meta.url);
const Az = require("az");
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const MAX_TEXT = 50000;

function takeText(args) {
  const t = String(args.text ?? "");
  if (!t.trim()) throw bad("text: передайте текст для проверки");
  if (t.length > MAX_TEXT) throw bad(`text: не больше ${MAX_TEXT} символов за один вызов`);
  return t;
}

// ---------- Проверка иностранных слов ----------
const IGNORE_LATIN = /^(https?:\/\/|www\.)|@|\.(ru|com|рф|org|net|io)\b/i;
const TECH = /^[A-Z0-9]{2,}$|\d/; // артикулы, коды, аббревиатуры вроде SKU123, USB, QR

function lemmaInfo(word) {
  const parses = Az.Morph(word) || [];
  const dict = parses.find((p) => p.parser === "Dictionary");
  const lemma = (dict || parses[0])?.normalize?.()?.word || word;
  return { lemma: lemma.toLowerCase(), known: !!dict };
}

function lookup(table, lower, lemma) {
  if (table[lower]) return lower;
  if (table[lemma]) return lemma;
  // формы, которые словарь не знает: «дедлайна», «фидбэком»
  for (const k of Object.keys(table)) if (lower.startsWith(k) && lower.length - k.length <= 3 && k.length >= 4) return k;
  return null;
}

export async function checkForeignWords(args) {
  await initMorph();
  const text = takeText(args);
  const allow = new Set((Array.isArray(args.allow) ? args.allow : String(args.allow || "").split(","))
    .map((s) => String(s).trim().toLowerCase()).filter(Boolean));

  const latin = new Map(), strong = new Map(), soft = new Map(), unknown = new Map();
  const add = (map, key, item) => { const e = map.get(key); if (e) e.count++; else map.set(key, { ...item, count: 1 }); };

  // Латиница: слова и словосочетания из латинских букв (почту и адреса сайтов не трогаем)
  const scan = text.replace(/\S+@\S+|https?:\/\/\S+|www\.\S+|\b[\w-]+\.(ru|com|рф|org|net|io|su)\b\S*/gi, " ");
  for (const m of scan.matchAll(/[A-Za-z][A-Za-z'’&.-]*(?:\s+[A-Za-z][A-Za-z'’&-]*)*/g)) {
    const phrase = m[0].replace(/[.\-]+$/, "");
    if (!phrase || IGNORE_LATIN.test(phrase) || allow.has(phrase.toLowerCase())) continue;
    const words = phrase.split(/\s+/);
    if (words.every((w) => TECH.test(w))) continue;
    const hints = [...new Set(words.flatMap((w) => LAT[w.toLowerCase()] || []))];
    add(latin, phrase.toLowerCase(), { text: phrase, suggestions: hints });
  }

  // Кириллица: жаргонные и распространённые заимствования, слова вне словаря
  for (const m of text.matchAll(/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g)) {
    const word = m[0];
    const lower = word.toLowerCase();
    if (allow.has(lower) || lower.length < 3) continue;
    const { lemma, known } = lemmaInfo(lower);
    let k;
    if ((k = lookup(CYR_STRONG, lower, lemma))) add(strong, k, { word: k, found: word, suggestions: CYR_STRONG[k] });
    else if ((k = lookup(CYR_SOFT, lower, lemma))) add(soft, k, { word: k, found: word, suggestions: CYR_SOFT[k] });
    else if (!known && lower.length >= 5 && !/^[А-ЯЁ]/.test(word)) add(unknown, lemma, { word: lemma, found: word });
  }

  const list = (m) => [...m.values()];
  const summary = { latin: latin.size, likely_not_in_dictionaries: strong.size, check_in_dictionary: soft.size, unknown_to_open_dictionary: unknown.size };
  const total = summary.latin + summary.likely_not_in_dictionaries;
  return {
    summary,
    verdict: total
      ? `Найдено ${total} мест, которые стоит заменить или сопроводить переводом, и ${summary.check_in_dictionary} слов для сверки со словарём.`
      : summary.check_in_dictionary
        ? `Латиницы и жаргонных англицизмов не найдено; ${summary.check_in_dictionary} распространённых заимствований стоит сверить со словарём.`
        : "Латиницы и англицизмов из нашего списка не найдено.",
    latin: list(latin),
    likely_not_in_dictionaries: list(strong),
    check_in_dictionary: list(soft),
    unknown_to_open_dictionary: list(unknown).slice(0, 50),
    exceptions: "Без перевода допустимы зарегистрированные товарные знаки и фирменные наименования (передайте их в allow), а также слова, которые есть в нормативных словарях.",
    disclaimer:
      "Это автоматическая подсказка, а не юридическое заключение. Сервис находит латиницу и слова из нашего списка частых англицизмов, но не сверяет текст с нормативными словарями, утверждёнными распоряжением Правительства № 1102-р от 30.04.2025 (опубликованы на сайте Института русского языка РАН). Окончательное решение — за вами или вашим юристом.",
  };
}

// ---------- Типограф ----------
const SHORT = "в|во|к|ко|с|со|у|о|об|обо|и|а|но|на|по|за|из|от|до|не|ни|без|для|под|над|при|про|через|что|как|или|то";
export async function typograph(args) {
  let t = takeText(args);
  const NB = " ";
  t = t.replace(/\r\n/g, "\n").replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\.{3}/g, "…");
  t = t.replace(/\((c|с)\)/gi, "©").replace(/\(r\)/gi, "®").replace(/\(tm\)/gi, "™").replace(/\+-/g, "±");
  // кавычки: «ёлочки» снаружи, „лапки“ внутри
  let depth = 0;
  t = t.replace(/["«»“”„]/g, (q, i, s) => {
    const prev = s[i - 1] || "";
    const opening = q === "«" || q === "„" || (q !== "»" && q !== "”" && q !== "“" && (!prev || /[\s(\[{ —–-]/.test(prev)));
    if (opening) { depth++; return depth === 1 ? "«" : "„"; }
    depth = Math.max(0, depth - 1);
    return depth === 0 ? "»" : "“";
  });
  // тире: « - » и « -- » между словами → неразрывный пробел + длинное тире
  t = t.replace(/(\S)[  ]+(-{1,2}|–|—)[  ]+/g, `$1${NB}— `);
  t = t.replace(/^(-{1,2}|–) /gm, `—${NB}`);
  // диапазоны чисел: 10-20 → 10–20
  t = t.replace(/(\d)-(\d)/g, "$1–$2");
  // неразрывные пробелы после коротких слов, перед частицами, у чисел и сокращений
  t = t.replace(new RegExp(`(^|[\\s(«„])(${SHORT}) `, "gi"), `$1$2${NB}`);
  t = t.replace(new RegExp(`(^|[\\s(«„])(${SHORT}) `, "gi"), `$1$2${NB}`); // второй проход для «и в»
  t = t.replace(/ (ли|же|бы|ль|б)([\s.,!?…]|$)/g, `${NB}$1$2`);
  t = t.replace(/(№|§) ?(\d)/g, `$1${NB}$2`);
  t = t.replace(/(\d) (₽|руб\.?|коп\.?|р\.|тыс\.?|млн|млрд|%|кг|г\.|м|см|мм|км|л|шт\.?|ч|мин|сек|°)/g, `$1${NB}$2`);
  t = t.replace(/(\d)\s?%/g, `$1${NB}%`);
  t = t.replace(/(^|[\s(])(т\. ?[едп]\.|т\. ?к\.|и т\. ?[дп]\.|и др\.|и пр\.)/g, (m, pre, abbr) => pre + abbr.replace(/ /g, NB));
  t = t.replace(/(\d) (\d{3})(?!\d)/g, `$1${NB}$2`);
  t = t.replace(/(г|ул|д|кв|стр|корп|пр|пос|обл|р-н|им)\. ([А-ЯЁ0-9])/g, `$1.${NB}$2`);
  const out = { text: t, changed: t !== String(args.text) };
  if (args.format === "html") out.html = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
  return out;
}

// ---------- Транслитерация ----------
const MAPS = {
  // Приказ МВД № 889 (рекомендации ИКАО Doc 9303) — загранпаспорта, банковские карты
  passport: { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "ie", ы: "y", ь: "", э: "e", ю: "iu", я: "ia" },
  // ГОСТ 7.79-2000, система Б (без диакритики)
  gost: { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "j", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "cz", ч: "ch", ш: "sh", щ: "shh", ъ: "``", ы: "y`", ь: "`", э: "e`", ю: "yu", я: "ya" },
  // для адресов страниц и имён файлов
  slug: { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" },
};

export async function transliterate(args) {
  const text = takeText(args);
  const sys = ["passport", "gost", "slug"].includes(args.system) ? args.system : "passport";
  const map = MAPS[sys];
  let out = "";
  const chars = [...text];
  chars.forEach((ch, i) => {
    const lower = ch.toLowerCase();
    let r = map[lower];
    if (r == null) { out += ch; return; }
    // ГОСТ 7.79-Б: ц перед е, и, ы, й → cz, иначе c
    if (sys === "gost" && lower === "ц") r = /[еиыйeiyj]/i.test(chars[i + 1] || "") ? "cz" : "c";
    if (ch !== lower && r) {
      const isUp = (c) => !!c && c !== c.toLowerCase();
      r = isUp(chars[i + 1]) || isUp(chars[i - 1]) || chars.length === 1 ? r.toUpperCase() : r[0].toUpperCase() + r.slice(1);
    }
    out += r;
  });
  if (sys === "slug") out = out.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return {
    system: { passport: "Загранпаспорт и банковские карты (приказ МВД № 889, ИКАО Doc 9303)", gost: "ГОСТ 7.79-2000, система Б", slug: "Адрес страницы (slug)" }[sys],
    result: out,
  };
}
