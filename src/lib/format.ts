import { formatInTimeZone } from "date-fns-tz";

export const TZ = "America/Chicago";

export const fmtDate = (d: Date | string) => formatInTimeZone(new Date(d), TZ, "EEE, MMM d");
export const fmtDateLong = (d: Date | string) => formatInTimeZone(new Date(d), TZ, "EEEE, MMMM d, yyyy");
export const fmtTime = (d: Date | string) => formatInTimeZone(new Date(d), TZ, "h:mm a");
export const fmtDateTime = (d: Date | string) => formatInTimeZone(new Date(d), TZ, "EEE M/d h:mm a");
export const fmtYmd = (d: Date | string) => formatInTimeZone(new Date(d), TZ, "yyyy-MM-dd");
export const fmtInputDateTime = (d: Date | string) => formatInTimeZone(new Date(d), TZ, "yyyy-MM-dd'T'HH:mm");
export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
