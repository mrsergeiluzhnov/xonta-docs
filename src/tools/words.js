// Сумма прописью для счетов, актов и договоров. Деньги считаются в копейках (целыми числами),
// чтобы не было ошибок округления с плавающей точкой.

const ONES = {
  m: ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"],
  f: ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"],
};
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

// [одна, две-четыре, пять+], род
const SCALES = [
  null,
  [["тысяча", "тысячи", "тысяч"], "f"],
  [["миллион", "миллиона", "миллионов"], "m"],
  [["миллиард", "миллиарда", "миллиардов"], "m"],
  [["триллион", "триллиона", "триллионов"], "m"],
];

export function plural(n, forms) {
  const n100 = n % 100, n10 = n % 10;
  if (n100 >= 11 && n100 <= 14) return forms[2];
  if (n10 === 1) return forms[0];
  if (n10 >= 2 && n10 <= 4) return forms[1];
  return forms[2];
}

function triad(n, gender) {
  const out = [];
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
  if (h) out.push(HUNDREDS[h]);
  if (t === 1) out.push(TEENS[o]);
  else {
    if (t) out.push(TENS[t]);
    if (o) out.push(ONES[gender][o]);
  }
  return out.join(" ");
}

// Целое число прописью в нужном роде: numberToWords(21, "f") → «двадцать одна».
export function numberToWords(num, gender = "m") {
  let n = BigInt(num);
  if (n === 0n) return "ноль";
  const neg = n < 0n;
  if (neg) n = -n;
  const parts = [];
  let i = 0;
  while (n > 0n) {
    const tri = Number(n % 1000n);
    if (tri) {
      if (i >= SCALES.length) throw Object.assign(new Error("Слишком большое число"), { status: 400 });
      const g = i === 0 ? gender : SCALES[i][1];
      const words = triad(tri, g);
      parts.unshift(i === 0 ? words : `${words} ${plural(tri, SCALES[i][0])}`);
    }
    n /= 1000n;
    i++;
  }
  return (neg ? "минус " : "") + parts.join(" ");
}

const CURRENCIES = {
  RUB: { major: [["рубль", "рубля", "рублей"], "m"], minor: [["копейка", "копейки", "копеек"], "f"], short: ["руб.", "коп."] },
  USD: { major: [["доллар США", "доллара США", "долларов США"], "m"], minor: [["цент", "цента", "центов"], "m"], short: ["долл. США", "цент."] },
  EUR: { major: [["евро", "евро", "евро"], "m"], minor: [["евроцент", "евроцента", "евроцентов"], "m"], short: ["евро", "евроцент."] },
  CNY: { major: [["юань", "юаня", "юаней"], "m"], minor: [["фэнь", "фэня", "фэней"], "m"], short: ["юан.", "фэн."] },
};

// "1 234,56" / "1234.56" / 1234.56 → копейки (целое число, BigInt)
export function toMinorUnits(amount) {
  let s = String(amount ?? "").trim().replace(/[\s ']/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw Object.assign(new Error(`Не удалось прочитать сумму «${amount}». Пример: 1234.56`), { status: 400 });
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  let [int, frac = ""] = s.split(".");
  // округление до копеек по правилам арифметики
  let minor = BigInt(int) * 100n + BigInt((frac + "00").slice(0, 2));
  if (frac.length > 2 && Number(frac[2]) >= 5) minor += 1n;
  return neg ? -minor : minor;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtNum = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function moneyWords(minor, cur, kopecksAs) {
  const c = CURRENCIES[cur];
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const major = abs / 100n, rest = Number(abs % 100n);
  const majorNum = Number(major % 1000n);
  let words = `${numberToWords(major, c.major[1])} ${plural(majorNum, c.major[0])}`;
  const restStr = String(rest).padStart(2, "0");
  words += kopecksAs === "words"
    ? ` ${numberToWords(rest, c.minor[1])} ${plural(rest, c.minor[0])}`
    : ` ${restStr} ${plural(rest, c.minor[0])}`;
  return {
    words: cap((neg ? "минус " : "") + words),
    numeric: `${neg ? "-" : ""}${fmtNum(major)} ${c.short[0]} ${restStr} ${c.short[1]}`,
    amount: `${neg ? "-" : ""}${major}.${restStr}`,
  };
}

// НДС в копейках с округлением половины вверх
function divRound(a, b) {
  return (a * 2n + b) / (2n * b);
}

export async function amountInWords(args) {
  const cur = String(args.currency || "RUB").toUpperCase();
  if (!CURRENCIES[cur]) throw Object.assign(new Error(`Валюта ${cur} не поддерживается. Доступны: ${Object.keys(CURRENCIES).join(", ")}`), { status: 400 });
  const kop = args.kopecks === "words" ? "words" : "digits";
  const minor = toMinorUnits(args.amount);
  const res = { ...moneyWords(minor, cur, kop), currency: cur };

  if (/^(none|без ндс|без|no)$/i.test(String(args.vat_rate ?? "").trim())) {
    res.vat = { rate: null, line: `${res.words}, без НДС` };
  } else if (args.vat_rate != null && args.vat_rate !== "") {
    const rate = Number(String(args.vat_rate).replace("%", "").replace(",", "."));
    if (!(rate >= 0 && rate <= 100)) throw Object.assign(new Error("vat_rate — ставка НДС в процентах, например 22"), { status: 400 });
    const rBig = BigInt(Math.round(rate * 100)); // в сотых долях процента
    const included = args.vat_included !== false;
    let vat, total;
    if (included) {
      vat = divRound(minor * rBig, 10000n + rBig);
      total = minor;
    } else {
      vat = divRound(minor * rBig, 10000n);
      total = minor + vat;
    }
    const v = moneyWords(vat, cur, kop);
    const t = moneyWords(total, cur, kop);
    res.vat = {
      rate,
      included,
      amount: v.amount,
      words: v.words,
      total: t.amount,
      total_words: t.words,
      line: included
          ? `${res.words}, в том числе НДС (${rate}%) ${v.numeric}`
          : `${t.words}, в том числе НДС (${rate}%) ${v.numeric}`,
    };
  }
  return res;
}
