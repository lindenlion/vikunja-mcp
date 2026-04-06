/**
 * Calendar integration — reads .ics sources (local files and remote URLs)
 * and returns expanded event instances in a given date range.
 *
 * Configuration via environment variables:
 *   CALENDAR_ICS_FILES – comma-separated paths to local .ics files
 *   CALENDAR_ICS_URLS  – comma-separated URLs (http/https/webcal)
 */
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
/** Load and expand all configured calendar sources for the given date range. */
export declare function loadCalendars(from: Date, to: Date): Promise<CalendarSource[]>;
/** True if any calendar sources are configured. */
export declare function hasCalendars(): boolean;
