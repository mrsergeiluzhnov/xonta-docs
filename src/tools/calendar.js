// Производственный календарь РФ: рабочие дни, праздники, переносы, сокращённые дни.
// Данные: xmlcalendar.ru (по постановлениям Правительства). Встроены 2025–2027,
// на сервере раз в сутки обновляются с xmlcalendar.ru, при недоступности берутся встроенные.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/calendar");
const SOURCE = (y) => `https://xmlcalendar.ru/data/ru/${y}/calendar.json`;
const years = new Map(); // year -> { off:Set("M-D"), short:Set("M-D"), holiday:Set("M-D"), source }

function parseYear(json, source) {
  const off = new Set(), short = new Set(), transferred = new Set();
  for (const m of json.months) {
    for (const t of String(m.days).split(",").map((x) => x.trim()).filter(Boolean)) {
      const key = `${m.month}-${parseInt(t, 10)}`;
      if (t.endsWith("*")) short.add(key);
      else {
        off.add(key);
        if (t.endsWith("+")) transferred.add(key);
      }
    }
  }
  return { off, short, transferred, source };
}

for (const f of readdirSync(DATA_DIR).filter((f) => /^\d{4}\.json$/.test(f))) {
  const json = JSON.parse(readFileSync(path.join(DATA_DIR, f), "utf8"));
  years.set(json.year, parseYear(json, "встроенные данные xmlcalendar.ru"));
}

let fetcher = (url) => fetch(url, { signal: AbortSignal.timeout(8000) });
export const setCalendarFetcher = (f) => { fetcher = f; };

async function refreshYear(y) {
  try {
    const r = await fetcher(SOURCE(y));
    if (!r.ok) return false;
    const json = await r.json();
    if (json.year !== y || !Array.isArray(json.months) || json.months.length !== 12) return false;
    years.set(y, parseYear(json, `xmlcalendar.ru, обновлено ${new Date().toISOString().slice(0, 10)}`));
    return true;
  } catch {
    return false;
  }
}

export async function refreshCalendars() {
  const y = new Date().getUTCFullYear();
  const res = await Promise.all([y - 1, y, y + 1].map(refreshYear));
  return res;
}

async function ensureYear(y) {
  if (!years.has(y)) await refreshYear(y);
  if (!years.has(y)) {
    const have = [...years.keys()].sort();
    throw Object.assign(new Error(`Нет данных производственного календаря за ${y} год (есть: ${have.join(", ")})`), { status: 404 });
  }
  return years.get(y);
}

const HOLIDAYS = {
  "1-1": "Новогодние каникулы", "1-2": "Новогодние каникулы", "1-3": "Новогодние каникулы", "1-4": "Новогодние каникулы",
  "1-5": "Новогодние каникулы", "1-6": "Новогодние каникулы", "1-7": "Рождество Христово", "1-8": "Новогодние каникулы",
  "2-23": "День защитника Отечества", "3-8": "Международный женский день", "5-1": "Праздник Весны и Труда",
  "5-9": "День Победы", "6-12": "День России", "11-4": "День народного единства",
};

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

function parseDate(s, field) {
  if (s == null || s === "") {
    // «сегодня» по Москве
    const now = new Date(Date.now() + 3 * 3600 * 1000);
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/) || String(s).trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) throw Object.assign(new Error(`${field}: дата в формате ГГГГ-ММ-ДД или ДД.ММ.ГГГГ`), { status: 400 });
  const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCMonth() !== +mo - 1) throw Object.assign(new Error(`${field}: такой даты нет`), { status: 400 });
  return dt;
}

async function dayInfo(d) {
  const y = await ensureYear(d.getUTCFullYear());
  const key = `${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
  const working = !y.off.has(key);
  let kind;
  if (working) kind = y.short.has(key) ? "сокращённый рабочий день (на 1 час короче)" : weekend ? "рабочий выходной (перенос)" : "рабочий день";
  else kind = HOLIDAYS[key] ? `праздник: ${HOLIDAYS[key]}` : y.transferred.has(key) ? "выходной (перенесённый)" : weekend ? "выходной" : "нерабочий день";
  return { date: iso(d), weekday: WEEKDAYS[d.getUTCDay()], working, short_day: y.short.has(key), kind };
}

const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

export async function workingDays(args) {
  const start = parseDate(args.date, "date");
  const MAX_SPAN = 3 * 366;

  // 1) Дата через N рабочих дней (день начала не считается, как в «оплата в течение 5 рабочих дней»)
  if (args.add_working_days != null && args.add_working_days !== "") {
    const n = Number(args.add_working_days);
    if (!Number.isInteger(n) || Math.abs(n) > 500) throw Object.assign(new Error("add_working_days — целое число от -500 до 500"), { status: 400 });
    const step = n >= 0 ? 1 : -1;
    let d = start, left = Math.abs(n), skipped = [];
    for (let i = 0; left > 0 && i < MAX_SPAN; i++) {
      d = addDays(d, step);
      const info = await dayInfo(d);
      if (info.working) left--;
      else if (!info.kind.startsWith("выходной") || info.kind.includes("перенес")) skipped.push(`${info.date} (${info.kind})`);
    }
    const res = await dayInfo(d);
    return {
      start: iso(start),
      add_working_days: n,
      result_date: res.date,
      result: res,
      calendar_days: Math.round((d - start) / 86400000),
      holidays_skipped: skipped,
      rule: "День начала не считается. Итоговая дата — последний рабочий день срока.",
    };
  }

  // 2) Сколько рабочих дней между датами (обе даты включительно)
  if (args.end_date) {
    const end = parseDate(args.end_date, "end_date");
    if (end < start) throw Object.assign(new Error("end_date раньше date"), { status: 400 });
    if ((end - start) / 86400000 > MAX_SPAN) throw Object.assign(new Error("Период не больше 3 лет"), { status: 400 });
    let work = 0, off = 0, short = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const info = await dayInfo(d);
      if (info.working) { work++; if (info.short_day) short++; } else off++;
    }
    return {
      start: iso(start), end: iso(end), working_days: work, non_working_days: off, short_days: short,
      calendar_days: work + off, hours_40h_week: work * 8 - short, rule: "Обе даты включительно.",
    };
  }

  // 3) Информация о дне + ближайший рабочий день
  const info = await dayInfo(start);
  let next = start;
  for (let i = 0; i < 30; i++) { next = addDays(next, 1); if ((await dayInfo(next)).working) break; }
  const y = years.get(start.getUTCFullYear());
  return { ...info, next_working_day: iso(next), source: y.source };
}
