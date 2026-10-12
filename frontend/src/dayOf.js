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

/**
 * The three stamps in the order a donor passes through them.
 *
 * Shared by the station and the clerk's worklist, so both describe the
 * sequence the same way.
 */
export const TIME_FIELDS = [
    { field: "time_in", label: "Time in" },
    { field: "time_canteen", label: "Canteen" },
    { field: "time_out", label: "Time out" },
];

/**
 * Why these times can't be right, or "" when they can.
 *
 * A donor arrives, then goes to the canteen, then leaves, so the stamps have
 * to run in that order. Checked on the way in rather than after the fact: an
 * out-of-order pair is almost always a typo or a stamp on the wrong row, and
 * it quietly corrupts the visit duration if it lands.
 *
 * Only fills in the gaps it is given — a missing middle stamp is normal while
 * a visit is in progress, so in/out alone are still compared to each other.
 */
export function timeOrderError(times) {
    const stamped = TIME_FIELDS.map(({ field, label }) => ({
        label,
        at: times[field] ? new Date(times[field]).getTime() : null,
    })).filter((step) => step.at !== null);

    for (let i = 1; i < stamped.length; i += 1) {
        const previous = stamped[i - 1];
        const current = stamped[i];
        if (current.at < previous.at) {
            return `${current.label} can't be before ${previous.label.toLowerCase()}.`;
        }
    }
    return "";
}

/**
 * Does this visit skip the canteen?
 *
 * Someone turned away never gets there, so the cell is ruled off as not
 * applicable rather than left looking unfinished, and nothing waits on it.
 */
export const skipsCanteen = (row) => Boolean(row.deferred);

/** Are this person's times all in? Arrival, the canteen unless they were
    deferred, and leaving. */
export const hasAllTimes = (row) =>
    Boolean(row.time_in && row.time_out && (skipsCanteen(row) || row.time_canteen));

/**
 * Is there nothing left to do for this person?
 *
 * Adults finish when their times are in — nobody files them. A student has
 * one more step after that: the clerk marking them off with the school. So a
 * student with every time stamped is not done, she is *ready* to be filed —
 * see `readyToFile`, which is what the rows waiting on her are tinted by.
 */
export function isVisitComplete(row, student) {
    if (student) return Boolean(row.attendance_cleared);
    return hasAllTimes(row);
}

/**
 * A student whose visit is over but who hasn't been filed yet.
 *
 * These are the clerk's queue, and the only rows that carry the waiting
 * tint: a student still mid-visit isn't her work yet, and an adult never is.
 */
export const readyToFile = (row, student) =>
    Boolean(student && !row.attendance_cleared && hasAllTimes(row));

/**
 * Set to a schedule time ("8:45 AM") to pin the highlight there instead of
 * following the clock. For demonstrating the day-of pages out of hours.
 */
export const PINNED_SLOT_TIME = null;

/** "8:45 AM" -> minutes since midnight, or null if it can't be read. */
export function slotMinutes(time) {
    const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((time ?? "").trim());
    if (!match) return null;
    const hour = Number(match[1]) % 12;
    const afternoon = match[3].toUpperCase() === "PM";
    return (hour + (afternoon ? 12 : 0)) * 60 + Number(match[2]);
}

/**
 * The slot the desk is working through: the latest one that has started.
 *
 * Picked by comparing against the schedule rather than by rounding the clock
 * to a quarter hour, so it lands on a real slot however the times are spaced
 * — and it holds on the last slot of the day instead of pointing at nothing
 * once the drive is over.
 *
 * Returns "" before the first appointment, when nothing is current yet.
 *
 * `times` is the distinct slot times in schedule order, which the tables
 * already have; `now` is a Date, injectable for testing.
 */
export function currentSlotTime(times, now = new Date()) {
    if (PINNED_SLOT_TIME) return PINNED_SLOT_TIME;

    const minutesNow = now.getHours() * 60 + now.getMinutes();
    let current = "";
    for (const time of times) {
        const at = slotMinutes(time);
        if (at === null || at > minutesNow) break;
        current = time;
    }
    return current;
}

/**
 * The class this person is missing for the time they were given.
 *
 * Stored per choice rather than per person, so the one to show is whichever
 * choice matches their assigned slot. A coordinator can move someone to a
 * time they never picked, in which case there is nothing recorded for it —
 * and adults are never asked, so they have none at all.
 */
/**
 * A stored class as the day-of tables show it.
 *
 * The database holds what the backend wrote at sign-up — "Marie Clarke,
 * Rm 301" — and existing rows keep that wording. This is presentation only:
 * the comma becomes a divider and "Rm" is spelled out, which reads better in
 * a column of its own than it did inside an email sentence.
 *
 * Anything that doesn't match the stored shape is passed through untouched,
 * so a value written by hand or by some later format still displays.
 */
const STORED_CLASS = /^(.*), Rm (.*)$/;

export function formatClass(value) {
    const match = STORED_CLASS.exec(value ?? "");
    return match ? `${match[1]} | Room ${match[2]}` : (value ?? "");
}

export function classForSlot(row) {
    const classes = [
        row.first_choice_class,
        row.second_choice_class,
        row.third_choice_class,
    ];
    const index = [row.first_choice, row.second_choice, row.third_choice]
        .indexOf(row.time_slot);
    return formatClass((index === -1 ? null : classes[index]) || "");
}
