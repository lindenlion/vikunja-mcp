/**
 * Calendar integration — reads .ics sources (local files and remote URLs)
 * and returns expanded event instances in a given date range.
 *
 * Configuration via environment variables:
 *   CALENDAR_ICS_FILES – comma-separated paths to local .ics files
 *   CALENDAR_ICS_URLS  – comma-separated URLs (http/https/webcal)
 */
import * as nodeIcal from "node-ical";
// ── Helpers ────────────────────────────────────────────────────────────
function resolveText(val) {
    if (!val)
        return "";
    if (typeof val === "string")
        return val;
    return val.val || "";
}
function normalizeUrl(url) {
    return url.replace(/^webcal:\/\//i, "https://");
}
function toCalendarEvent(event, start, calendarName) {
    const end = event.end instanceof Date
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
async function loadSource(src, isFile) {
    let data;
    if (isFile) {
        data = nodeIcal.sync.parseFile(src);
    }
    else {
        data = await nodeIcal.async.fromURL(normalizeUrl(src));
    }
    // Extract calendar name from VCALENDAR X-WR-CALNAME if present
    let calName = isFile
        ? (src.split("/").pop()?.replace(/\.ics$/i, "") ?? src)
        : src;
    for (const component of Object.values(data)) {
        if (component?.type === "VCALENDAR") {
            const raw = component["x-wr-calname"];
            if (raw)
                calName = resolveText(raw);
            break;
        }
    }
    const events = Object.values(data).filter((c) => c?.type === "VEVENT");
    return { name: calName, events };
}
// ── Public API ─────────────────────────────────────────────────────────
/** Load and expand all configured calendar sources for the given date range. */
export async function loadCalendars(from, to) {
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
    if (!sources.length)
        return [];
    const settled = await Promise.allSettled(sources.map(({ src, isFile }) => loadSource(src, isFile)));
    return settled.map((result, i) => {
        if (result.status === "rejected") {
            console.error(`Calendar load failed for ${sources[i].src}: ${result.reason}`);
            return {
                calendarName: sources[i].src,
                events: [],
                error: String(result.reason),
            };
        }
        const { name, events } = result.value;
        const expanded = [];
        for (const event of events) {
            if (event.rrule) {
                // Recurring event — expand all instances within the range
                const instances = nodeIcal.expandRecurringEvent(event, { from, to });
                for (const instance of instances) {
                    expanded.push(toCalendarEvent(instance.event, instance.start, name));
                }
            }
            else {
                const start = event.start instanceof Date ? event.start : new Date(event.start);
                const end = event.end instanceof Date
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
export function hasCalendars() {
    return (!!(process.env.CALENDAR_ICS_FILES ?? "").trim() ||
        !!(process.env.CALENDAR_ICS_URLS ?? "").trim());
}
//# sourceMappingURL=calendar.js.map