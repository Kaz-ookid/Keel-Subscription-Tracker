// Two distinct kinds of "time" that must never be confused, so each is a
// branded string type the compiler keeps separate:
//
//   CalendarDate — a wall-calendar day ("2026-06-01"), with NO time or zone.
//     Due dates and charge dates are calendar dates: a payment "due June 1st"
//     is due June 1st in Paris or Tokyo alike (PROJECT_BRIEF §8.3 edge #10).
//
//   Timestamp — an exact instant (ISO-8601, "2026-06-01T14:30:00Z").
//     Used for audit fields like createdAt/updatedAt where the real moment,
//     including zone, matters.
//
// Branding makes assigning a Timestamp where a CalendarDate is expected (or
// vice-versa) a compile error, even though both are strings at runtime.

export type CalendarDate = string & { readonly __brand: "CalendarDate" };
export type Timestamp = string & { readonly __brand: "Timestamp" };

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True if `value` is a real `YYYY-MM-DD` calendar day (rejects 2026-13-40). */
export function isCalendarDate(value: string): value is CalendarDate {
  if (!CALENDAR_DATE_RE.test(value)) return false;
  // Round-trip through Date to reject impossible days like 2026-02-30.
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Smart constructor — validates format, then brands. Throws on bad input. */
export function calendarDate(value: string): CalendarDate {
  if (!isCalendarDate(value)) {
    throw new RangeError(`Invalid calendar date: "${value}" (expected YYYY-MM-DD)`);
  }
  return value;
}

/** True if `value` parses as an ISO-8601 instant. */
export function isTimestamp(value: string): value is Timestamp {
  return !Number.isNaN(Date.parse(value)) && value.includes("T");
}

/** Smart constructor for an instant. Throws on un-parseable input. */
export function timestamp(value: string): Timestamp {
  if (!isTimestamp(value)) {
    throw new RangeError(`Invalid timestamp: "${value}" (expected ISO-8601)`);
  }
  return value;
}

/** The current instant as a `Timestamp`. */
export function now(): Timestamp {
  return new Date().toISOString() as Timestamp;
}

/** The current day as a `CalendarDate` — the impure sibling of `now()`. Pure
 *  calculation code takes an `asOf` parameter instead of calling this. */
export function today(): CalendarDate {
  return new Date().toISOString().slice(0, 10) as CalendarDate;
}

/** Format a calendar date for display in European style: "2026-06-08" → "08.06.2026".
 *  Storage stays ISO `YYYY-MM-DD`; this is presentation only. */
export function formatCalendarDate(date: CalendarDate): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

// NOTE: date arithmetic (advancing a CalendarDate by a RecurrenceRule to get
// the next charge date) is calculation logic and is deferred to the §7 work.
