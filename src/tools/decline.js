// Склонение ФИО (библиотека petrovich, правила для русских имён) и должностей
// (морфологический словарь OpenCorpora через Az.js). Работает локально.
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const petrovich = require("petrovich");
const Az = require("az");

let azReady;
export function initMorph() {
  azReady ??= new Promise((resolve, reject) => {
    const dir = path.join(path.dirname(require.resolve("az/package.json")), "dicts");
    Az.Morph.init(dir, (err) => (err ? reject(err) : resolve()));
  });
  return azReady;
}

const CASES = {
  nominative: { az: "nomn", p: null, ru: "именительный", q: "кто?" },
  genitive: { az: "gent", p: "genitive", ru: "родительный", q: "кого?" },
  dative: { az: "datv", p: "dative", ru: "дательный", q: "кому?" },
  accusative: { az: "accs", p: "accusative", ru: "винительный", q: "кого?" },
  instrumental: { az: "ablt", p: "instrumental", ru: "творительный", q: "кем?" },
  prepositional: { az: "loct", p: "prepositional", ru: "предложный", q: "о ком?" },
};
const ALIASES = {
  "именительный": "nominative", "им": "nominative", "nom": "nominative",
  "родительный": "genitive", "род": "genitive", "gen": "genitive",
  "дательный": "dative", "дат": "dative", "dat": "dative",
  "винительный": "accusative", "вин": "accusative", "acc": "accusative",
  "творительный": "instrumental", "тв": "instrumental", "твор": "instrumental", "ins": "instrumental",
  "предложный": "prepositional", "пр": "prepositional", "пред": "prepositional", "prep": "prepositional",
};
export function normCase(c) {
  const k = String(c || "").trim().toLowerCase().replace(/\.$/, "");
  if (CASES[k]) return k;
  if (ALIASES[k]) return ALIASES[k];
  throw Object.assign(new Error(`Неизвестный падеж «${c}». Допустимо: ${Object.keys(CASES).join(", ")} или по-русски (родительный, дательный…), либо all`), { status: 400 });
}

// Мужские имена на -а/-я, чтобы не принять их за женские при определении рода по имени.
const MALE_A = new Set(["никита", "илья", "кузьма", "фома", "лука", "савва", "данила", "гаврила", "фока", "иона", "миша", "саша", "паша", "дима", "женя", "ваня", "петя", "коля", "вася", "лёша", "леша", "серёжа", "сережа", "слава", "витя", "толя", "юра", "гоша", "жора", "костя", "федя", "лёва", "лева"]);

function guessGender({ first, middle, last }) {
  if (middle) {
    if (/(вич|ич|оглы|улы|ович|евич)$/i.test(middle)) return "male";
    if (/(вна|чна|ична|кызы|гызы)$/i.test(middle)) return "female";
  }
  if (first) {
    const f = first.toLowerCase();
    if (MALE_A.has(f)) return "male";
    if (/[ая]$/.test(f)) return "female";
    if (/[бвгджзйклмнпрстфхцчшщ]$/.test(f)) return "male";
  }
  if (last) {
    if (/(ова|ева|ёва|ина|ына|ская|цкая)$/i.test(last)) return "female";
    if (/(ов|ев|ёв|ин|ын|ский|цкий)$/i.test(last)) return "male";
  }
  return "androgynous";
}

function splitName(args) {
  if (args.last_name || args.first_name || args.middle_name)
    return { last: args.last_name?.trim(), first: args.first_name?.trim(), middle: args.middle_name?.trim() };
  if (!args.full_name) return null;
  const w = String(args.full_name).trim().split(/\s+/);
  // Порядок по умолчанию как в документах: Фамилия Имя Отчество. order=first_last — «Иван Петрович Иванов».
  if (args.order === "first_last") return { first: w[0], middle: w.length === 3 ? w[1] : undefined, last: w.length >= 2 ? w[w.length - 1] : undefined };
  return { last: w[0], first: w[1], middle: w.slice(2).join(" ") || undefined };
}

function declineName(parts, caseKey, gender) {
  if (caseKey === "nominative") return { ...parts };
  const person = { gender };
  if (parts.first) person.first = parts.first;
  if (parts.middle) person.middle = parts.middle;
  if (parts.last) person.last = parts.last;
  const r = petrovich(person, CASES[caseKey].p);
  return { last: r.last, first: r.first, middle: r.middle };
}

function formatName(p, order) {
  const full = order === "first_last" ? [p.first, p.middle, p.last] : [p.last, p.first, p.middle];
  const init = [p.first, p.middle].filter(Boolean).map((x) => x[0].toUpperCase() + ".").join(" ");
  return {
    full: full.filter(Boolean).join(" "),
    short: p.last ? [p.last, init].filter(Boolean).join(" ") : full.filter(Boolean).join(" "),
    initials_first: p.last ? [init, p.last].filter(Boolean).join(" ") : full.filter(Boolean).join(" "),
  };
}

// ---------- Должность ----------
const matchCase = (src, out) => (src === src.toUpperCase() && src.length > 1 ? out.toUpperCase() : src[0] === src[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out);

function inflectWord(parse, grams) {
  const r = parse.inflect(grams);
  return r ? r.word : null;
}

// Склоняем согласованную группу до главного существительного включительно («главного бухгалтера»),
// остальное оставляем как есть («начальника отдела продаж», «менеджера по работе с клиентами»).
export function declinePosition(text, caseKey) {
  if (caseKey === "nominative" || !text) return text;
  const az = CASES[caseKey].az;
  const tokens = String(text).trim().split(/(\s+)/);
  const words = tokens.map((t, i) => ({ t, i, space: /^\s+$/.test(t) })).filter((x) => !x.space);

  const candidates = words.map((w) => {
    const ps = Az.Morph(w.t.replace(/[«»"(),.]/g, "")) || [];
    return {
      ...w,
      adj: ps.find((p) => (p.tag.ADJF || p.tag.PRTF) && p.tag.nomn),
      noun: ps.find((p) => p.tag.NOUN && p.tag.nomn && !p.tag.Fixd),
      fixed: ps.length && ps[0].tag.Fixd,
    };
  });

  // главное существительное — первое слово, которое может быть существительным в именительном
  // падеже и не стоит перед другим существительным как прилагательное
  let head = -1;
  for (let k = 0; k < candidates.length; k++) {
    const c = candidates[k];
    if (c.fixed) break;
    const next = candidates[k + 1];
    if (c.adj && next && (next.noun || next.adj)) continue; // «старший» перед «менеджер» — прилагательное
    if (c.noun) { head = k; break; }
    break;
  }
  if (head < 0) return null;

  const headParse = candidates[head].noun;
  const anim = !!headParse.tag.anim;
  const plur = !!headParse.tag.plur;
  const out = [...tokens];
  for (let k = 0; k <= head; k++) {
    const c = candidates[k];
    let w;
    if (k === head) {
      w = inflectWord(c.noun, [az]);
      // составные «инженер-программист», «юрист-консультант»: склоняем каждую часть
      if (!w && c.t.includes("-")) {
        const parts = c.t.split("-").map((part) => {
          const p = (Az.Morph(part) || []).find((x) => x.tag.NOUN && x.tag.nomn);
          return p ? inflectWord(p, [az]) : null;
        });
        w = parts.every(Boolean) ? parts.join("-") : null;
      }
    }
    else {
      // винительный падеж у одушевлённых: «назначить главного бухгалтера», а не «главный»
      const grams = az === "accs" && anim && (plur || headParse.tag.masc) ? ["gent"] : [az];
      if (plur) grams.push("plur");
      w = inflectWord(c.adj, grams);
    }
    if (!w) return null;
    out[c.i] = matchCase(c.t, w);
  }
  return out.join("");
}

export async function declineTool(args) {
  await initMorph();
  const parts = splitName(args);
  if (!parts && !args.position) throw Object.assign(new Error("Передайте full_name (например «Иванов Иван Петрович»), отдельные last_name/first_name/middle_name и/или position"), { status: 400 });
  const caseArg = String(args.case || "genitive").toLowerCase();
  const keys = caseArg === "all" ? Object.keys(CASES) : [normCase(caseArg)];
  const gender = args.gender === "male" || args.gender === "female" ? args.gender : parts ? guessGender(parts) : undefined;

  const results = {};
  for (const k of keys) {
    const r = { case: CASES[k].ru, question: CASES[k].q };
    if (parts) Object.assign(r, formatName(declineName(parts, k, gender), args.order));
    if (args.position) {
      const pos = declinePosition(args.position, k);
      r.position = pos ?? args.position;
      if (pos == null) r.position_warning = "Не удалось уверенно разобрать должность, оставлена без изменений";
    }
    if (parts && args.position && r.position) r.position_and_name = `${r.position} ${r.full}`;
    results[k] = r;
  }
  return {
    gender: gender ?? null,
    ...(keys.length === 1 ? results[keys[0]] : { cases: results }),
    note: gender === "androgynous" ? "Пол не определён — для фамилий вроде «Ковальчук» передайте gender: male или female" : undefined,
  };
}
