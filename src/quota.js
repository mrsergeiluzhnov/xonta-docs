// Бесплатный доступ с ограничениями: лимит в сутки на IP, общий потолок на всех и ограничение скорости.
// Счётчики в памяти (сбрасываются в полночь UTC и при перезапуске) — для бесплатных инструментов этого достаточно.
const env = process.env;
const PER_IP_DAY = Number(env.FREE_DAILY_PER_IP ?? 300);
const TOTAL_DAY = Number(env.FREE_DAILY_TOTAL ?? 20000);
const PER_IP_MIN = Number(env.RATE_PER_MIN ?? 60);

let day = "", perIp = new Map(), total = 0;
const minute = new Map(); // ip -> { m, n }

export function takeSlot(ip, weight = 1) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (today !== day) { day = today; perIp = new Map(); total = 0; minute.clear(); }

  const m = Math.floor(now.getTime() / 60000);
  const rm = minute.get(ip);
  if (rm && rm.m === m && rm.n >= PER_IP_MIN) return { ok: false, reason: `Не больше ${PER_IP_MIN} вызовов в минуту с одного адреса. Повторите через минуту.` };
  const used = perIp.get(ip) || 0;
  if (used + weight > PER_IP_DAY) return { ok: false, reason: `Бесплатный лимит ${PER_IP_DAY} вызовов в сутки с одного адреса исчерпан. Для большего объёма напишите на xonta.ru.` };
  if (total + weight > TOTAL_DAY) return { ok: false, reason: "Сервис временно перегружен бесплатными запросами. Попробуйте позже." };

  minute.set(ip, rm && rm.m === m ? { m, n: rm.n + 1 } : { m, n: 1 });
  perIp.set(ip, used + weight);
  total += weight;
  return { ok: true, left_today: PER_IP_DAY - used - weight };
}

export const quotaInfo = () => ({ per_ip_per_day: PER_IP_DAY, per_ip_per_minute: PER_IP_MIN });
