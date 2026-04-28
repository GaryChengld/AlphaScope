function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function observedDate(d: Date): Date {
  const day = d.getDay();
  if (day === 6) return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  if (day === 0) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return d;
}

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first  = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last   = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nyseHolidays(year: number): Set<string> {
  const easter    = easterSunday(year);
  const goodFriday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);

  const holidays = [
    observedDate(new Date(year, 0, 1)),       // New Year's Day
    nthWeekday(year, 0, 1, 3),               // MLK Day (3rd Mon Jan)
    nthWeekday(year, 1, 1, 3),               // Presidents' Day (3rd Mon Feb)
    goodFriday,                               // Good Friday
    lastWeekday(year, 4, 1),                 // Memorial Day (last Mon May)
    observedDate(new Date(year, 5, 19)),      // Juneteenth
    observedDate(new Date(year, 6, 4)),       // Independence Day
    nthWeekday(year, 8, 1, 1),               // Labor Day (1st Mon Sep)
    nthWeekday(year, 10, 4, 4),              // Thanksgiving (4th Thu Nov)
    observedDate(new Date(year, 11, 25)),     // Christmas
  ];

  return new Set(holidays.map(toKey));
}

export function isMarketDay(date: Date = new Date()): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !nyseHolidays(date.getFullYear()).has(toKey(date));
}
