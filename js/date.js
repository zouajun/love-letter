/* =========================================================
   日期工具：全部按「本地日期」计算，避免时区把日子算错
   ========================================================= */

const DAY = 86400000;
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const m = String(value).match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function utcStamp(d) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** b - a，单位天 */
export function diffDays(a, b) {
  return Math.round((utcStamp(b) - utcStamp(a)) / DAY);
}

export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function addYears(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setFullYear(x.getFullYear() + n);
  return x;
}

export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 2024 年 5 月 20 日 */
export function fmtCN(d) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** 2024.05.20 */
export function fmtDot(d) {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** 05.20 */
export function fmtMD(d) {
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** 周一 */
export function weekdayCN(d) {
  return WEEK[d.getDay()];
}

/** 距目标还有多久（本地时间） */
export function countdown(from, target) {
  const ms = target.getTime() - from.getTime();
  const past = ms < 0;
  const abs = Math.abs(ms);
  return {
    past,
    days: Math.floor(abs / DAY),
    hours: Math.floor((abs % DAY) / 3600000),
    minutes: Math.floor((abs % 3600000) / 60000),
    seconds: Math.floor((abs % 60000) / 1000)
  };
}

/** 把秒数格式化成 hh:mm:ss */
export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  return `${pad(h)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
