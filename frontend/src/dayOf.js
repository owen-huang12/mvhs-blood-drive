/** Helpers shared by the check-in station and the attendance worklist. */

/** A stamped time as the desk reads it — local clock, to the minute. */
export const formatStamp = (value) =>
    value
        ? new Date(value).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
          })
        : "";

/**
 * How long the whole appointment took, from arrival to leaving.
 *
 * Derived rather than stored: both endpoints are already recorded, so keeping
 * a duration column would just be a second copy that could disagree with them
 * after a correction. Empty until the visit is finished.
 */
export function visitDuration(row) {
    if (!row.time_in || !row.time_out) return "";
    const minutes = Math.round(
        (new Date(row.time_out) - new Date(row.time_in)) / 60000,
    );
    // A negative reading means the times were stamped or corrected out of
    // order. Showing it plainly beats hiding it — the desk can then fix it.
    if (minutes < 0) return "—";
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * Whether this student still needs filing in the school's attendance system.
 *
 * Derived, not stored: a student who has arrived but hasn't been cleared is
 * outstanding work, and that falls out of the two facts already recorded.
 * Arriving and being marked off are separate facts with separate owners —
 * the desk stamps the first, the clerk records the second.
 */
export const needsFiling = (row) =>
    Boolean(row.time_in) && !row.attendance_cleared;

/**
 * Hour before which a bare, meridiem-less time is read as the afternoon.
 *
 * The drive runs inside the school day, so nothing is stamped before this —
 * a typed "1:30" is half past one in the afternoon, not the morning.
 */
const SCHOOL_DAY_START_HOUR = 7;

/** A stamp as editable text, in the same 12-hour form the cell displays. */
export const toTimeInput = (value) => formatStamp(value);

/**
 * Parse a typed time into a full timestamp.
 *
 * Accepts what someone actually types at a desk — "9:47 PM", "9:47pm",
 * "21:47", "947p", "0947" — rather than one rigid format. Returns null for
 * anything it can't read, so a half-finished entry is never written.
 *
 * The date comes from the stamp being edited, or from today for a time typed
 * into an empty cell — a drive runs within one day, so today is always right.
 */
export function fromTimeInput(text, existing) {
    const cleaned = (text ?? "").trim().toLowerCase().replace(/\s+/g, "");
    if (!cleaned) return null;

    const match = /^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/.exec(cleaned);
    if (!match) return null;

    let hours = Number(match[1]);
    // "947" and "0947" mean 9:47 — a bare 3-or-4 digit run is hhmm, not an
    // hour. Only applies when no colon separated them.
    if (match[2] === undefined && match[1].length > 2) return null;
    let minutes = match[2] === undefined ? 0 : Number(match[2]);
    const meridiem = match[3]?.[0];

    if (minutes > 59) return null;

    if (meridiem) {
        if (hours < 1 || hours > 12) return null;
        hours = (hours % 12) + (meridiem === "p" ? 12 : 0);
    } else if (hours > 23) {
        return null;
    } else if (hours >= 1 && hours < SCHOOL_DAY_START_HOUR) {
        // A bare "1:30" during a school-day drive means the afternoon. Taking
        // it literally would put the stamp at half one in the morning, which
        // is never what anyone at the desk meant.
        hours += 12;
    }

    const at = existing ? new Date(existing) : new Date();
    at.setHours(hours, minutes, 0, 0);
    return at.toISOString();
}
