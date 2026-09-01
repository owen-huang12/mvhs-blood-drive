/**
 * Single source of truth for blood-drive time slots.
 *
 * Slots are stored in the database as "<period> - <time>" (e.g.
 * "Period 2 - 8:30 AM"), which is what `formatSlot` produces and
 * `parseSlot` reads back.
 */

export const TIME_SLOTS = [
    { period: "Period 2", time: "8:30 AM" },
    { period: "Period 2", time: "8:45 AM" },
    { period: "Period 2", time: "9:00 AM" },
    { period: "Period 2", time: "9:15 AM" },
    { period: "Period 2", time: "9:30 AM" },
    { period: "Period 2", time: "9:45 AM" },
    { period: "Period 2/Tutorial", time: "10:00 AM" },
    { period: "Tutorial", time: "10:15 AM" },
    { period: "Tutorial", time: "10:30 AM" },
    { period: "Tutorial", time: "10:45 AM" },
    { period: "Brunch/Period 4", time: "11:00 AM" },
    { period: "Period 4", time: "11:15 AM" },
    { period: "Period 4", time: "11:30 AM" },
    { period: "Period 4", time: "11:45 AM" },
    { period: "Period 4", time: "12:00 PM" },
    { period: "Period 4", time: "12:15 PM" },
    { period: "Period 4/Lunch", time: "12:30 PM" },
    { period: "Lunch", time: "12:45 PM" },
    { period: "Lunch", time: "1:00 PM" },
    { period: "Lunch/Period 6", time: "1:15 PM" },
    { period: "Period 6", time: "1:30 PM" },
    { period: "Period 6", time: "1:45 PM" },
    { period: "Period 6", time: "2:00 PM" },
    { period: "Period 6", time: "2:15 PM" },
];

/**
 * Pastel ramp running warm (morning) to cool (afternoon). Deliberately avoids
 * saturated red, which is reserved for error and full-slot states so the two
 * never read as the same signal.
 *
 * Every pairing below clears WCAG AA (4.5:1) for body text.
 */
export const PERIOD_COLORS = {
    "Period 2": { bg: "#F5F1DC", text: "#71642A" },
    "Period 2/Tutorial": { bg: "#F4E6D7", text: "#87582F" },
    "Tutorial": { bg: "#F2E0E0", text: "#8B4B4B" },
    "Brunch/Period 4": { bg: "#EEDFEC", text: "#79477A" },
    "Period 4": { bg: "#E3DEF0", text: "#584C92" },
    "Period 4/Lunch": { bg: "#DBE2F1", text: "#3D5482" },
    "Lunch": { bg: "#D9E6EC", text: "#2C5C71" },
    "Lunch/Period 6": { bg: "#D8E9E5", text: "#2A6D5E" },
    "Period 6": { bg: "#DDEAD9", text: "#3C6A3D" },
};

export const CHOICE_LABELS = ["1st choice", "2nd choice", "3rd choice"];
export const REQUIRED_CHOICES = 3;

/**
 * Positions available per slot, taken from the row counts in the appointment
 * spreadsheet. Capacity is not uniform — 8:30 AM seats three, 9:15 AM one.
 * Mirrored by SLOT_CAPACITY in backend/main.py, which enforces it.
 */
export const SLOT_CAPACITY = {
    "Period 2 - 8:30 AM": 3,
    "Period 2 - 8:45 AM": 2,
    "Period 2 - 9:00 AM": 2,
    "Period 2 - 9:15 AM": 1,
    "Period 2 - 9:30 AM": 1,
    "Period 2 - 9:45 AM": 1,
    "Period 2/Tutorial - 10:00 AM": 2,
    "Tutorial - 10:15 AM": 3,
    "Tutorial - 10:30 AM": 2,
    "Tutorial - 10:45 AM": 2,
    "Brunch/Period 4 - 11:00 AM": 2,
    "Period 4 - 11:15 AM": 2,
    "Period 4 - 11:30 AM": 1,
    "Period 4 - 11:45 AM": 1,
    "Period 4 - 12:00 PM": 1,
    "Period 4 - 12:15 PM": 1,
    "Period 4/Lunch - 12:30 PM": 2,
    "Lunch - 12:45 PM": 2,
    "Lunch - 1:00 PM": 2,
    "Lunch/Period 6 - 1:15 PM": 2,
    "Period 6 - 1:30 PM": 3,
    "Period 6 - 1:45 PM": 2,
    "Period 6 - 2:00 PM": 2,
    "Period 6 - 2:15 PM": 2,
};

const DEFAULT_CAPACITY = 1;

export const capacityFor = (slotKey) => SLOT_CAPACITY[slotKey] ?? DEFAULT_CAPACITY;

const SEPARATOR = " - ";
const FALLBACK_COLOR = { bg: "#ECECEC", text: "#5F5F5F" };

/** Chronological position of a slot string, for sorting. */
const SLOT_ORDER = new Map(
    TIME_SLOTS.map((slot, index) => [`${slot.period}${SEPARATOR}${slot.time}`, index])
);

export const formatSlot = (slot) => `${slot.period}${SEPARATOR}${slot.time}`;

/** "Period 2 - 8:30 AM" -> { period: "Period 2", time: "8:30 AM" } */
export function parseSlot(value) {
    if (!value) return { period: "", time: "" };
    const at = value.indexOf(SEPARATOR);
    if (at === -1) return { period: value, time: "" };
    return {
        period: value.slice(0, at),
        time: value.slice(at + SEPARATOR.length),
    };
}

export const colorsForPeriod = (period) => PERIOD_COLORS[period] ?? FALLBACK_COLOR;

export const slotOrder = (value) => SLOT_ORDER.get(value) ?? Number.MAX_SAFE_INTEGER;

/**
 * Build the full appointment schedule: every slot on the spreadsheet, in
 * order, grouped by period for a rowspan-per-period table.
 *
 * A slot with nobody confirmed yields one `open` row so coordinators can see
 * the free positions; a slot with people yields one `booked` row each.
 * Confirmed sign-ups whose slot isn't on the spreadsheet are collected into a
 * trailing "Unscheduled" group rather than silently dropped.
 */
export function buildSchedule(signUps) {
    const bySlot = new Map();
    for (const signUp of signUps) {
        const list = bySlot.get(signUp.time_slot) ?? [];
        list.push(signUp);
        bySlot.set(signUp.time_slot, list);
    }

    const groups = [];
    const pushRows = (period, rows) => {
        const last = groups.at(-1);
        if (last && last.period === period) last.rows.push(...rows);
        else groups.push({ period, rows });
    };

    for (const slot of TIME_SLOTS) {
        const key = formatSlot(slot);
        const booked = bySlot.get(key) ?? [];
        bySlot.delete(key);

        // Render this slot's own capacity. If existing data has already
        // overfilled a slot, show everyone rather than hiding rows.
        const rows = booked.map((signUp) => ({
            kind: "booked",
            time: slot.time,
            key,
            signUp,
        }));
        for (let i = booked.length; i < capacityFor(key); i += 1) {
            rows.push({ kind: "open", time: slot.time, key, seat: i });
        }

        pushRows(slot.period, rows);
    }

    // Anything left over referenced a slot not on the spreadsheet.
    const leftover = [...bySlot.entries()].sort(
        ([a], [b]) => slotOrder(a) - slotOrder(b)
    );
    for (const [key, list] of leftover) {
        pushRows(
            "Unscheduled",
            list.map((signUp) => ({
                kind: "booked",
                time: parseSlot(key).time || key,
                key,
                signUp,
            }))
        );
    }

    return groups;
}

/** Count of people already confirmed into a given slot. */
export function countInSlot(signUps, slotKey) {
    return signUps.filter((signUp) => signUp.time_slot === slotKey).length;
}

export const isSlotFull = (signUps, slotKey) =>
    countInSlot(signUps, slotKey) >= capacityFor(slotKey);

/**
 * Earliest slot on the schedule that still has room — the fallback when
 * every one of a person's three choices is already full.
 */
export function firstOpenSlot(signUps) {
    const slot = TIME_SLOTS.find((s) => !isSlotFull(signUps, formatSlot(s)));
    return slot ? formatSlot(slot) : "";
}

/** Total unfilled positions across the whole schedule. */
export function countOpenSlots(signUps) {
    return TIME_SLOTS.reduce((total, slot) => {
        const key = formatSlot(slot);
        return total + Math.max(0, capacityFor(key) - countInSlot(signUps, key));
    }, 0);
}
