/**
 * When the day-of dashboards open.
 *
 * Mirrors PHASE_TWO_START in backend/main.py. This copy only decides what the
 * UI offers; the server enforces the same date on every day-of write, so a
 * client that gets here early still cannot change anything.
 *
 * Set VITE_PHASE_TWO_OVERRIDE=1 (alongside PHASE_TWO_OVERRIDE=1 on the API)
 * to work on these pages before the date.
 */
export const PHASE_TWO_START = new Date("2026-10-14T00:00:00Z");

export const isPhaseTwoOpen = () =>
    import.meta.env.VITE_PHASE_TWO_OVERRIDE === "1" ||
    new Date() >= PHASE_TWO_START;
