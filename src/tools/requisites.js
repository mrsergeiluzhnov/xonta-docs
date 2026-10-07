// Проверка российских реквизитов по контрольным суммам. Работает локально, без внешних запросов.
// Проверяет формат и контрольное число, а не существование организации в реестре.

const digits = (s) => String(s ?? "").replace(/[\s\-–—]/g, "");
const isDigits = (s, n) => new RegExp(`^\\d{${n}}$`).test(s);
const weighted = (s, w) => w.reduce((acc, k, i) => acc + k * Number(s[i]), 0);

export function checkInn(raw) {
  const s = digits(raw);
  if (isDigits(s, 10)) {
    const c = (weighted(s, [2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10;
    return c === Number(s[9])
      ? { valid: true, kind: "ИНН юридического лица (10 цифр)" }
      : { valid: false, kind: "ИНН юридического лица (10 цифр)", error: `Неверное контрольное число: ожидалась ${c} на 10-й позиции` };
  }
  if (isDigits(s, 12)) {
    const c1 = (weighted(s, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10;
    const c2 = (weighted(s, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10;
    const ok = c1 === Number(s[10]) && c2 === Number(s[11]);
    return ok
      ? { valid: true, kind: "ИНН физического лица или ИП (12 цифр)" }
      : { valid: false, kind: "ИНН физического лица или ИП (12 цифр)", error: `Неверные контрольные числа: ожидались ${c1}${c2} на 11–12-й позициях` };
  }
  return { valid: false, error: "ИНН должен состоять из 10 цифр (организация) или 12 цифр (физлицо, ИП)" };
}

export function checkOgrn(raw) {
  const s = digits(raw);
  if (isDigits(s, 13)) {
    const c = Number((BigInt(s.slice(0, 12)) % 11n) % 10n);
    return c === Number(s[12])
      ? { valid: true, kind: "ОГРН (13 цифр, юридическое лицо)" }
      : { valid: false, kind: "ОГРН (13 цифр, юридическое лицо)", error: `Неверное контрольное число: ожидалась ${c}` };
  }
  if (isDigits(s, 15)) {
    const c = Number((BigInt(s.slice(0, 14)) % 13n) % 10n);
    return c === Number(s[14])
      ? { valid: true, kind: "ОГРНИП (15 цифр, индивидуальный предприниматель)" }
      : { valid: false, kind: "ОГРНИП (15 цифр, индивидуальный предприниматель)", error: `Неверное контрольное число: ожидалась ${c}` };
  }
  return { valid: false, error: "ОГРН состоит из 13 цифр, ОГРНИП из 15 цифр" };
}

export function checkKpp(raw) {
  const s = digits(raw).toUpperCase();
  if (!/^\d{4}[\dA-Z]{2}\d{3}$/.test(s)) return { valid: false, error: "КПП: 9 символов — 4 цифры кода налогового органа, 2 символа причины постановки на учёт, 3 цифры порядкового номера" };
  return { valid: true, kind: "КПП", tax_office: s.slice(0, 4), reason_code: s.slice(4, 6) };
}

export function checkBik(raw) {
  const s = digits(raw);
  if (!isDigits(s, 9)) return { valid: false, error: "БИК состоит из 9 цифр" };
  if (!s.startsWith("04")) return { valid: false, error: "БИК банка в России начинается с 04" };
  return { valid: true, kind: "БИК" };
}

// Ключевание счёта по БИК (положение ЦБ). Для корр. счёта используются «0» + 5–6 цифры БИК,
// для расчётного — последние 3 цифры БИК.
function accountKeyOk(bik, account, corr) {
  const prefix = corr ? "0" + bik.slice(4, 6) : bik.slice(6, 9);
  const s = prefix + account;
  const w = [7, 1, 3];
  let sum = 0;
  for (let i = 0; i < 23; i++) sum += (Number(s[i]) * w[i % 3]) % 10;
  return sum % 10 === 0;
}

export function checkAccount(raw, bikRaw, { corr = false } = {}) {
  const s = digits(raw);
  const name = corr ? "Корреспондентский счёт" : "Расчётный счёт";
  if (!isDigits(s, 20)) return { valid: false, error: `${name} состоит из 20 цифр` };
  if (corr && !s.startsWith("301")) return { valid: false, error: "Корреспондентский счёт банка начинается с 301" };
  const bik = digits(bikRaw);
  if (!bik) return { valid: null, kind: name, warning: "Без БИК контрольную сумму счёта проверить нельзя — передайте bik" };
  if (!checkBik(bik).valid) return { valid: null, kind: name, warning: "БИК неверный, контрольную сумму счёта проверить нельзя" };
  return accountKeyOk(bik, s, corr)
    ? { valid: true, kind: name, currency_code: s.slice(5, 8) }
    : { valid: false, kind: name, error: `Контрольная сумма не сходится с БИК ${bik}: счёт или БИК указаны с ошибкой` };
}

export function checkSnils(raw) {
  const s = digits(raw);
  if (!isDigits(s, 11)) return { valid: false, error: "СНИЛС состоит из 11 цифр" };
  const num = s.slice(0, 9);
  if (Number(num) <= 1001998) return { valid: true, kind: "СНИЛС", note: "Номера до 001-001-998 контрольным числом не проверяются" };
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(num[i]) * (9 - i);
  let c = sum < 100 ? sum : sum === 100 || sum === 101 ? 0 : sum % 101;
  if (c === 100) c = 0;
  return c === Number(s.slice(9))
    ? { valid: true, kind: "СНИЛС" }
    : { valid: false, kind: "СНИЛС", error: `Неверное контрольное число: ожидалось ${String(c).padStart(2, "0")}` };
}

const FIELDS = ["inn", "kpp", "ogrn", "bik", "account", "corr_account", "snils"];

export async function validateRequisites(args) {
  const provided = FIELDS.filter((f) => args[f] != null && String(args[f]).trim() !== "");
  if (!provided.length) {
    const e = new Error(`Передайте хотя бы одно поле: ${FIELDS.join(", ")}`);
    e.status = 400;
    throw e;
  }
  const r = {};
  if (args.inn) r.inn = checkInn(args.inn);
  if (args.kpp) r.kpp = checkKpp(args.kpp);
  if (args.ogrn) r.ogrn = checkOgrn(args.ogrn);
  if (args.bik) r.bik = checkBik(args.bik);
  if (args.account) r.account = checkAccount(args.account, args.bik);
  if (args.corr_account) r.corr_account = checkAccount(args.corr_account, args.bik, { corr: true });
  if (args.snils) r.snils = checkSnils(args.snils);

  // Перекрёстные проверки: что реквизиты относятся к одному лицу.
  const warnings = [];
  const inn = digits(args.inn), ogrn = digits(args.ogrn), kpp = digits(args.kpp);
  if (inn.length === 12 && kpp) warnings.push("У ИП и физлиц нет КПП, а указан ИНН из 12 цифр");
  if (inn.length === 10 && ogrn.length === 15) warnings.push("ИНН из 10 цифр (организация), а ОГРН из 15 (ИП) — похоже, реквизиты разных лиц");
  if (inn.length === 12 && ogrn.length === 13) warnings.push("ИНН из 12 цифр (ИП), а ОГРН из 13 (организация) — похоже, реквизиты разных лиц");
  if (inn.length === 10 && kpp.length === 9 && inn.slice(0, 2) !== kpp.slice(0, 2))
    warnings.push("Регион в ИНН и КПП различается — так бывает у филиалов и крупнейших налогоплательщиков, но стоит перепроверить");
  if (args.corr_account && args.bik && digits(args.corr_account).slice(-3) !== digits(args.bik).slice(-3))
    warnings.push("Последние 3 цифры корр. счёта обычно совпадают с последними 3 цифрами БИК");

  const all_valid = Object.values(r).every((x) => x.valid !== false) && Object.values(r).some((x) => x.valid === true);
  return {
    all_valid,
    results: r,
    warnings,
    note: "Проверяются формат и контрольные числа. Существование организации в ЕГРЮЛ этим инструментом не проверяется.",
  };
}
