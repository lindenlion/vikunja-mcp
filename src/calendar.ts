/**
 * Calendar integration — reads .ics sources (local files and remote URLs)
 * and returns expanded event instances in a given date range.
 *
 * Configuration via environment variables:
 *   CALENDAR_ICS_FILES – comma-separated paths to local .ics files
 *   CALENDAR_ICS_URLS  – comma-separated URLs (http/https/webcal)
 */

import nodeIcal from "node-ical";
import { resolve } from "path";

// ── Types ──────────────────────────────────────────────────────────────

export interface CalendarEvent {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  location: string;
  description: string;
  calendarName: string;
}

export interface CalendarSource {
  calendarName: string;
  events: CalendarEvent[];
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function resolveText(val: nodeIcal.ParameterValue | undefined): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  return val.val || "";
}

function normalizeUrl(url: string): string {
  return url.replace(/^webcal:\/\//i, "https://");
}

function validateFilePath(src: string): string {
  const resolved = resolve(src);
  // Reject paths that look like they escaped via symlink tricks or were not absolute
  if (resolved.includes("\0")) throw new Error(`Invalid calendar file path: ${src}`);
  return resolved;
}

const PRIVATE_IP_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|0\.0\.0\.0)/i;

function validateUrl(src: string): string {
  const normalized = normalizeUrl(src);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Invalid calendar URL: ${src}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Calendar URL must use https:// (got ${parsed.protocol})`);
  }
  if (PRIVATE_IP_RE.test(parsed.hostname)) {
    throw new Error(`Calendar URL hostname is not allowed: ${parsed.hostname}`);
  }
  return normalized;
}

function toCalendarEvent(
  event: nodeIcal.VEvent,
  start: Date,
  calendarName: string
): CalendarEvent {
  const end =
    event.end instanceof Date
      ? event.end
      : event.start instanceof Date
      ? event.start
      : start;
  return {
    uid: event.uid,
    summary: resolveText(event.summary),
    start,
    end,
    isAllDay: event.datetype === "date",
    location: resolveText(event.location),
    description: resolveText(event.description),
    calendarName,
  };
}

async function loadSource(
  src: string,
  isFile: boolean
): Promise<{ name: string; events: nodeIcal.VEvent[] }> {
  let data: nodeIcal.CalendarResponse;

  if (isFile) {
    data = nodeIcal.sync.parseFile(validateFilePath(src));
  } else {
    data = await nodeIcal.async.fromURL(validateUrl(src));
  }

  // Extract calendar name from VCALENDAR X-WR-CALNAME if present
  let calName = isFile
    ? (src.split("/").pop()?.replace(/\.ics$/i, "") ?? src)
    : src;

  for (const component of Object.values(data)) {
    if (component?.type === "VCALENDAR") {
      const raw = (component as Record<string, unknown>)["x-wr-calname"];
      if (raw) calName = resolveText(raw as nodeIcal.ParameterValue);
      break;
    }
  }

  const events = Object.values(data).filter(
    (c): c is nodeIcal.VEvent => c?.type === "VEVENT"
  );

  return { name: calName, events };
}

// ── Public API ─────────────────────────────────────────────────────────

/** Load and expand all configured calendar sources for the given date range. */
export async function loadCalendars(
  from: Date,
  to: Date
): Promise<CalendarSource[]> {
  const fileSrcs = (process.env.CALENDAR_ICS_FILES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((src) => ({ src, isFile: true }));

  const urlSrcs = (process.env.CALENDAR_ICS_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((src) => ({ src, isFile: false }));

  const sources = [...fileSrcs, ...urlSrcs];
  if (!sources.length) return [];

  const settled = await Promise.allSettled(
    sources.map(({ src, isFile }) => loadSource(src, isFile))
  );

  return settled.map((result, i) => {
    if (result.status === "rejected") {
      console.error(
        `Calendar load failed for ${sources[i].src}: ${result.reason}`
      );
      return {
        calendarName: sources[i].src,
        events: [],
        error: String(result.reason),
      };
    }

    const { name, events } = result.value;
    const expanded: CalendarEvent[] = [];

    for (const event of events) {
      if (event.rrule) {
        // Recurring event — expand all instances within the range
        const instances = nodeIcal.expandRecurringEvent(event, { from, to });
        for (const instance of instances) {
          expanded.push(
            toCalendarEvent(instance.event as nodeIcal.VEvent, instance.start, name)
          );
        }
      } else {
        const start =
          event.start instanceof Date ? event.start : new Date(event.start);
        const end =
          event.end instanceof Date
            ? event.end
            : event.start instanceof Date
            ? event.start
            : start;
        // Include if the event overlaps with [from, to]
        if (start <= to && end >= from) {
          expanded.push(toCalendarEvent(event, start, name));
        }
      }
    }

    expanded.sort((a, b) => a.start.getTime() - b.start.getTime());
    return { calendarName: name, events: expanded };
  });
}

/** True if any calendar sources are configured. */
export function hasCalendars(): boolean {
  return (
    !!(process.env.CALENDAR_ICS_FILES ?? "").trim() ||
    !!(process.env.CALENDAR_ICS_URLS ?? "").trim()
  );
}
