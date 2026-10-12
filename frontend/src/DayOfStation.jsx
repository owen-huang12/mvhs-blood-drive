import { useEffect, useState, useRef } from "react";
import Header from "./Header.jsx";
import ProfilePill from "./ProfilePill.jsx";
import Spinner from "./Spinner.jsx";
import SlotRing from "./SlotRing.jsx";
import SelectionRing from "./SelectionRing.jsx";
import useCellSelection, { cellKey, parseCellKey } from "./useCellSelection.js";
import PendingSignUps from "./PendingSignUps.jsx";
import Modal from "./Modal.jsx";
import TimeStampCell from "./TimeStampCell.jsx";
import useLiveSignUps from "./useLiveSignUps.js";
import useCurrentSlot from "./useCurrentSlot.js";
import { isStudent, participantOf } from "./participants.js";
import {
    SLOT_TIMES,
    colorsForPeriod,
    firstOpenSlot,
    isSlotFull,
    parseSlot,
    slotOrder,
} from "./timeSlots.js";
import {
    confirmSignUp,
    getCurrentCoordinator,
    listSlotCapacity,
    moveSignUp,
    setDeferred,
    stampDayOf,
    stampDayOfBulk,
} from "./api.js";
import {
    DEFAULT_COORDINATOR_COLOR,
    classForSlot,
    shortName,
    isVisitComplete,
    readyToFile,
    skipsCanteen,
    timeOrderError,
    visitDuration,
} from "./dayOf.js";

/** The stamps the desk records, in the order a donor passes through them. */
/** How each arrow key moves the selection through the grid. */
const ARROW_STEPS = {
    ArrowUp: { row: -1, column: 0 },
    ArrowDown: { row: 1, column: 0 },
    ArrowLeft: { row: 0, column: -1 },
    ArrowRight: { row: 0, column: 1 },
};

/** The columns the selection covers, in the order they are shown. */
const TIME_COLUMNS = ["time_in", "time_canteen", "time_out"];

const STEPS = [
    { field: "time_in", label: "In" },
    { field: "time_canteen", label: "Canteen" },
    { field: "time_out", label: "Out" },
];

/**
 * Check-in station for the day of the drive.
 *
 * One row per confirmed appointment, in schedule order, with the three times
 * stamped by tapping. Deliberately holds no health information: a deferral is
 * a bare flag, and the reason for it stays with the Red Cross staff.
 */
export default function DayOfStation() {
    const { signUps, loading, error, setError, applyUpdate, write, addRow } =
        useLiveSignUps();
    // Moves on by itself as the drive runs.
    const currentSlot = useCurrentSlot(SLOT_TIMES);
    // The box the ring is measured against and drawn inside.
    const tableRef = useRef(null);
    // The day's appointments, in the order they are shown — which is also
    // the order the selection walks when a block is extended.
    const rows = signUps
        .filter((signUp) => signUp.confirmed)
        .sort(
            (a, b) =>
                slotOrder(a.time_slot) - slotOrder(b.time_slot) ||
                a.full_name.localeCompare(b.full_name),
        );
    const rowIds = rows.map((row) => row.id);

    // Spreadsheet-style selection over the three time columns: click a
    // cell, drag its handle to extend. Delete clears the block, and one
    // undo puts it back.
    const {
        selected,
        handleCell,
        clearSelection,
        selectCell,
        focusCell,
        moveFocus,
        moveDownFrom,
        startExtend,
        extendTo,
    } = useCellSelection({ rows: rowIds, columns: TIME_COLUMNS });
    // The last bulk clear, for Cmd+Z: the rows exactly as they were.
    const undoRef = useRef(null);
    // The clear waiting to be confirmed, with what it would touch.
    const [confirmingClear, setConfirmingClear] = useState(null);
    const [name, setName] = useState("");
    // This coordinator's marker colour, set by hand in the coordinators
    // table. Two people working the same table tell their selections apart
    // by it; unset falls back to the shared default.
    const [color, setColor] = useState(DEFAULT_COORDINATOR_COLOR);
    // Positions per slot, for the pending list's picker. Empty reads as
    // "every slot at its base capacity", which is right until it loads.
    const [capacity, setCapacity] = useState({});
    // The student whose times the desk tried to change after filing.
    // The row an explanation is open for, and which one: "locked" when a
    // filed record blocks an edit, "clerk" when the desk clicks the column
    // the clerk owns.
    const [explaining, setExplaining] = useState(null);

    // Only for the header pill; a failure here leaves it on its fallback
    // rather than keeping the desk from working.
    useEffect(() => {
        let cancelled = false;
        getCurrentCoordinator()
            .then((me) => {
                if (cancelled) return;
                setName(me.full_name);
                if (me.color) setColor(me.color);
            })
            .catch(() => {});
        // A failure here leaves every slot at base capacity, which is the
        // right fallback for an unedited drive.
        listSlotCapacity()
            .then((rows) => {
                if (cancelled) return;
                setCapacity(
                    Object.fromEntries(
                        rows.map((row) => [row.time_slot, row.capacity]),
                    ),
                );
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    /**
     * Give a pending sign-up one of the times they asked for.
     *
     * Someone who turns up late fills out the public form at the desk, so
     * they arrive here unconfirmed; seating them without leaving the page
     * is the difference between a queue and a scramble.
     */
    const handleConfirm = async (id, timeSlot) => {
        try {
            const updated = await confirmSignUp(id, timeSlot);
            setError("");
            return updated;
        } catch (err) {
            setError(
                err.status === 409
                    ? err.message
                    : "Could not confirm that sign-up. Please try again.",
            );
            throw err;
        }
    };

    /** Any other time: the strict confirm route refuses one not chosen. */
    const handleOverride = async (id, timeSlot) => {
        try {
            const updated = await moveSignUp(id, timeSlot);
            setError("");
            return updated;
        } catch (err) {
            setError(
                err.status === 409
                    ? err.message
                    : "Could not confirm that sign-up. Please try again.",
            );
            throw err;
        }
    };

    /**
     * The selections to outline, the viewer's own among them.
     *
     * A list rather than a single block because coordinators will see each
     * other's: the component already lays several out side by side, so
     * sharing them later is a matter of adding entries here.
     */
    const selections =
        selected.size > 0
            ? [
                  {
                      id: "self",
                      selected,
                      label: shortName(name),
                      color,
                      isSelf: true,
                  },
              ]
            : [];

    /**
     * Empty every selected cell at once.
     *
     * The cells clear on screen before the writes go out — the desk is
     * usually fixing a visible mistake and should see it gone — and if any
     * row fails, that row is put back.
     *
     * One request per person, not per cell: three separate writes for the
     * same row each return the whole row, so the last to arrive overwrites
     * the others and the cells flicker on their way to settling.
     */
    /**
     * What clearing the selection would actually touch.
     *
     * Only cells that hold a time and belong to someone not yet filed:
     * empty cells have nothing to clear, and filed times are part of the
     * school's record, which the API refuses too.
     */
    const plannedClear = () => {
        // Grouped by person, so each row is one write.
        const byRow = new Map();
        let lockedOut = 0;
        let cells = 0;

        for (const key of selected) {
            const { id, field } = parseCellKey(key);
            const row = signUps.find((signUp) => signUp.id === id);
            if (!row || !row[field]) continue;
            if (row.attendance_cleared) {
                lockedOut += 1;
                continue;
            }
            const entry = byRow.get(id) ?? { row, times: {} };
            entry.times[field] = null;
            byRow.set(id, entry);
            cells += 1;
        }
        return { byRow, lockedOut, cells };
    };

    /**
     * Ask before clearing more than one cell.
     *
     * A single cell is a visible, obvious correction and undo covers it.
     * A block is not: the selection can run past what is on screen, and
     * the times it holds are the record of people who have already been
     * through. Worth one keystroke to be sure.
     */
    const confirmClear = () => {
        const plan = plannedClear();
        if (plan.cells === 0) {
            clearSelection();
            setError(
                plan.lockedOut > 0
                    ? "Those times are part of a filed attendance record. Ask the attendance clerk to clear the filing first."
                    : "",
            );
            return;
        }
        if (plan.cells === 1) {
            clearSelected();
            return;
        }
        setConfirmingClear(plan);
    };

    const clearSelected = async () => {
        const { byRow, lockedOut } = plannedClear();
        setConfirmingClear(null);

        if (byRow.size === 0) {
            clearSelection();
            setError(
                lockedOut > 0
                    ? "Those times are part of a filed attendance record. Ask the attendance clerk to clear the filing first."
                    : "",
            );
            return;
        }

        // Snapshot for undo, before anything changes.
        const before = new Map(
            [...byRow.values()].map(({ row }) => [row.id, { ...row }]),
        );
        undoRef.current = before;

        byRow.forEach(({ row, times }) => applyUpdate({ ...row, ...times }));
        clearSelection();
        setError("");

        const results = await Promise.allSettled(
            [...byRow.values()].map(({ row, times }) =>
                write(row.id, () => stampDayOfBulk(row.id, times)),
            ),
        );

        const failed = [...byRow.values()].filter(
            (_, i) => results[i].status === "rejected",
        );
        if (failed.length > 0) {
            // Put back only the rows that did not save, and drop the undo:
            // it no longer describes what is on screen.
            failed.forEach(({ row }) => applyUpdate(before.get(row.id)));
            undoRef.current = null;
            setError(
                failed.length === byRow.size
                    ? "Could not clear those times. Please try again."
                    : `Could not clear ${failed.length} of ${byRow.size} rows.`,
            );
            return;
        }

        for (const result of results) {
            if (result.status === "fulfilled") applyUpdate(result.value);
        }

        if (lockedOut > 0) {
            setError(
                `${lockedOut} cell${lockedOut === 1 ? " was" : "s were"} left alone: attendance is already filed.`,
            );
        }
    };

    /** Put back the last bulk clear, one write per person. */
    const undoClear = async () => {
        const before = undoRef.current;
        if (!before) return;
        undoRef.current = null;

        before.forEach((row) => applyUpdate(row));
        setError("");

        const rows = [...before.values()];
        const results = await Promise.allSettled(
            rows.map((row) =>
                write(row.id, () =>
                    stampDayOfBulk(
                        row.id,
                        Object.fromEntries(
                            STEPS.map(({ field }) => [field, row[field] ?? null]),
                        ),
                    ),
                ),
            ),
        );

        if (results.some((r) => r.status === "rejected")) {
            setError("Could not restore those times. Please try again.");
            return;
        }
        for (const result of results) {
            if (result.status === "fulfilled") applyUpdate(result.value);
        }
    };

    /**
     * Anything outside the time cells dismisses the selection.
     *
     * Clicking elsewhere means the desk has moved on — to a checkbox, to
     * another part of the page — and leaving a block outlined behind them
     * would make the next Delete a surprise.
     */
    useEffect(() => {
        const onPointerDown = (event) => {
            if (event.target.closest?.("[data-cell]")) return;
            // The confirmation is about the selection, so clicking it is
            // not clicking away from it.
            if (event.target.closest?.(".modal-card, .modal-overlay")) return;
            clearSelection();
        };
        window.addEventListener("pointerdown", onPointerDown);
        return () => window.removeEventListener("pointerdown", onPointerDown);
    }, [clearSelection]);

    // Delete clears the selection; Cmd/Ctrl+Z puts the last clear back.
    // Ignored while typing, so editing a time still behaves normally.
    useEffect(() => {
        const onKeyDown = (event) => {
            // Escape dismisses the selection from anywhere, including a
            // field: it is the one key that should always back out. While
            // the confirmation is open it closes that instead, leaving the
            // block intact — cancelling should not also lose the selection.
            if (event.key === "Escape") {
                if (confirmingClear) setConfirmingClear(null);
                else clearSelection();
                return;
            }

            const typing = event.target.closest?.("input, textarea, select");
            if (typing) return;

            const undoKey = (event.metaKey || event.ctrlKey) && event.key === "z";
            if (undoKey) {
                event.preventDefault();
                undoClear();
                return;
            }
            if (event.key === "Delete" || event.key === "Backspace") {
                if (selected.size === 0) return;
                event.preventDefault();
                confirmClear();
                return;
            }

            // Enter drops into the block's far corner to type a time —
            // the same cell the drag handle sits on.
            if (event.key === "Enter") {
                if (!handleCell) return;
                event.preventDefault();
                tableRef.current
                    ?.querySelector(`[data-cell-input="${handleCell}"]`)
                    ?.focus();
                return;
            }

            // Arrows walk the block around; shift stretches it instead.
            const step = ARROW_STEPS[event.key];
            if (step) {
                event.preventDefault();
                moveFocus(step.row, step.column, event.shiftKey);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    });

    const pending = signUps.filter((signUp) => !signUp.confirmed);

    /**
     * Apply a change to one row, showing it before the server confirms it.
     *
     * `optimistic` is the row as it will look if the write succeeds; it goes
     * on screen at once and is rolled back to `row` if the request fails.
     * A volunteer at the desk stamps faster than the round trip, and a cell
     * that only fills once the server answers is a cell they tap twice.
     */
    const run = async (row, optimistic, action) => {
        if (optimistic) applyUpdate(optimistic);
        setError("");
        try {
            // Authoritative: carries anything the clerk changed meanwhile.
            applyUpdate(await write(row.id, action));
        } catch (err) {
            // Back to what was on screen before the click, written from the
            // original row so a stream update isn't undone along with it.
            if (optimistic) applyUpdate(row);
            setError(
                err.status === 403
                    ? "Day-of features are not open yet."
                    : "Could not save that. Please try again.",
            );
        }
    };

    /**
     * Set one of the three times, unless it would put them out of order.
     *
     * Rejected before it is sent: an out-of-order stamp is nearly always a
     * typo or the wrong row, and it would otherwise land in the record and
     * throw off the visit duration.
     */
    const setTime = (row, field, value) => {
        if (value) {
            const problem = timeOrderError({ ...row, [field]: value });
            if (problem) {
                // A popup, not the banner at the top: the banner sits above a
                // long table and is easily off screen by the time someone is
                // stamping a row near the bottom.
                setExplaining({ row, why: "order", problem });
                return;
            }
        }
        run(row, { ...row, [field]: value }, () =>
            stampDayOf(row.id, field, value),
        );
    };

    const arrived = rows.filter((row) => row.time_in).length;

    return (
        <div className="dashboard-page">
            <Header>
                <ProfilePill name={name} color={color} />
            </Header>
            <main className="dashboard-content">
                <h2 className="dashboard-section-title">Check-In Station</h2>

                <div className="dashboard-body">
                    {error && <p className="login-error">{error}</p>}

                    {loading ? (
                        <Spinner label="Loading appointments…" />
                    ) : (
                      <>
                        {/* Above the day's appointments: someone who turns
                            up late fills out the public form at the desk and
                            lands here, waiting for a time. Confirming them
                            drops them straight into the table below.

                            Always shown, empty state and all, so the desk
                            can see at a glance that nobody is waiting rather
                            than wondering whether the section is missing. */}
                        <PendingSignUps
                            signUps={pending}
                            onConfirm={handleConfirm}
                            onOverride={handleOverride}
                            onCommit={addRow}
                            isSlotFull={(key) => isSlotFull(rows, key, capacity)}
                            earliestOpen={firstOpenSlot(rows, capacity)}
                        />

                        <section className="dash-section">
                            <h3 className="dash-heading">
                                Today's Appointments:
                                <span className="count-badge green">
                                    {arrived} arrived
                                </span>
                                <span className="count-badge grey">
                                    {rows.length - arrived} awaited
                                </span>
                            </h3>

                            <div
                                className="table-scroll is-selectable"
                                ref={tableRef}
                                style={{ "--marker": color }}
                            >
                                <table className="appointment-table day-of-table attendance-table">
                                    <thead>
                                        <tr>
                                            <th>Period</th>
                                            <th>App. Time</th>
                                            <th>Full Name</th>
                                            <th>Class missed</th>
                                            <th className="status-cell">Status</th>
                                            <th>Grade</th>
                                            <th>Student ID</th>
                                            <th className="stamp-cell">Time In</th>
                                            <th className="stamp-cell">Canteen</th>
                                            <th className="stamp-cell">Time Out</th>
                                            <th className="stamp-cell">Duration</th>
                                            <th className="deferred-cell">Deferred?</th>
                                            <th className="attendance-cell">Filed</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, index) => {
                                            const slot = parseSlot(row.time_slot);
                                            const person = participantOf(row);
                                            const student = isStudent(row);
                                            const periodBg = colorsForPeriod(
                                                slot.period,
                                            ).bg;
                                            // The time column is the period's
                                            // colour half-way to white, so a
                                            // slot reads as part of its period.
                                            const timeBg = `color-mix(in srgb, ${periodBg} 50%, #fff)`;

                                            // One period cell per run of rows in
                                            // the same period, one time cell per
                                            // run in the same slot.
                                            const prev = rows[index - 1];
                                            const startsPeriod =
                                                index === 0 ||
                                                parseSlot(prev.time_slot).period !==
                                                    slot.period;
                                            let periodRows = 1;
                                            while (
                                                rows[index + periodRows] &&
                                                parseSlot(
                                                    rows[index + periodRows].time_slot,
                                                ).period === slot.period
                                            ) {
                                                periodRows += 1;
                                            }

                                            const startsSlot =
                                                index === 0 ||
                                                prev.time_slot !== row.time_slot;
                                            let slotRows = 1;
                                            while (
                                                rows[index + slotRows]?.time_slot ===
                                                row.time_slot
                                            ) {
                                                slotRows += 1;
                                            }

                                            return (
                                                <tr
                                                    key={row.id}
                                                    // Found by SlotRing, which
                                                    // measures these rows to
                                                    // size its overlay.
                                                    data-slot-now={
                                                        slot.time === currentSlot
                                                            ? ""
                                                            : undefined
                                                    }
                                                    className={[
                                                        startsPeriod ? "period-start" : "",
                                                        // Done donating, now
                                                        // waiting on the clerk.
                                                        readyToFile(row, student)
                                                            ? "row-needs-filing"
                                                            : "",
                                                        // Tinted only once there
                                                        // is nothing left to
                                                        // record: a student is
                                                        // filed, an adult has
                                                        // their times in. A
                                                        // deferral on its own
                                                        // isn't the end of a
                                                        // visit — they still
                                                        // have to check out.
                                                        isVisitComplete(row, student)
                                                            ? "row-filed"
                                                            : "",
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" ")}
                                                >
                                                    {startsPeriod && (
                                                        <td
                                                            className="period-cell"
                                                            rowSpan={periodRows}
                                                            style={{
                                                                backgroundColor: periodBg,
                                                            }}
                                                        >
                                                            {slot.period}
                                                        </td>
                                                    )}
                                                    {startsSlot && (
                                                        <td
                                                            className="appointment-time"
                                                            rowSpan={slotRows}
                                                            style={{
                                                                backgroundColor: timeBg,
                                                            }}
                                                        >
                                                            {slot.time}
                                                            <span className="slot-count">
                                                                (x{slotRows})
                                                            </span>
                                                        </td>
                                                    )}
                                                    <td className="name-cell">
                                                        {row.full_name}
                                                    </td>
                                                    <td className="class-cell">
                                                        {classForSlot(row) || (
                                                            <span
                                                                className="not-applicable"
                                                                title="Not applicable"
                                                            />
                                                        )}
                                                    </td>
                                                    <td
                                                        className="status-cell"
                                                        style={{
                                                            backgroundColor: person.bg,
                                                            color: person.text,
                                                        }}
                                                    >
                                                        {person.label}
                                                    </td>
                                                    {/* Only students have a grade
                                                        or an ID; a ruled line says
                                                        "not applicable" where an
                                                        empty cell would read as
                                                        "not filled in yet". */}
                                                    <td className="grade-cell">
                                                        {student ? (
                                                            row.grade
                                                        ) : (
                                                            <span
                                                                className="not-applicable"
                                                                title="Not applicable"
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="id-cell">
                                                        {student ? (
                                                            row.student_id
                                                        ) : (
                                                            <span
                                                                className="not-applicable"
                                                                title="Not applicable"
                                                            />
                                                        )}
                                                    </td>
    
                                                    {STEPS.map((step) =>
                                                        // Someone turned away
                                                        // never reaches the
                                                        // canteen, so the cell
                                                        // is ruled off rather
                                                        // than left looking
                                                        // unfinished.
                                                        step.field === "time_canteen" &&
                                                        skipsCanteen(row) ? (
                                                            <td
                                                                key={step.field}
                                                                className="stamp-cell"
                                                            >
                                                                <span
                                                                    className="not-applicable"
                                                                    title="Deferred — no canteen visit"
                                                                />
                                                            </td>
                                                        ) : (
                                                        <TimeStampCell
                                                            key={step.field}
                                                            value={row[step.field]}
                                                            label={step.label}
                                                            cellId={cellKey(
                                                                row.id,
                                                                step.field,
                                                            )}
                                                            selected={selected.has(
                                                                cellKey(
                                                                    row.id,
                                                                    step.field,
                                                                ),
                                                            )}
                                                            hasHandle={
                                                                handleCell ===
                                                                cellKey(
                                                                    row.id,
                                                                    step.field,
                                                                )
                                                            }
                                                            onSelect={(extend) =>
                                                                selectCell(
                                                                    row.id,
                                                                    step.field,
                                                                    extend,
                                                                )
                                                            }
                                                            // Enter in the
                                                            // field saves and
                                                            // moves down, so a
                                                            // column of times
                                                            // can be typed
                                                            // without reaching
                                                            // for the mouse.
                                                            onCommitAndMove={() =>
                                                                moveDownFrom(
                                                                    row.id,
                                                                    step.field,
                                                                )
                                                            }
                                                            onFocusCell={() =>
                                                                focusCell(
                                                                    row.id,
                                                                    step.field,
                                                                )
                                                            }
                                                            onExtendFrom={startExtend}
                                                            onExtendTo={() =>
                                                                extendTo(
                                                                    row.id,
                                                                    step.field,
                                                                )
                                                            }
                                                            locked={row.attendance_cleared}
                                                            onLocked={() =>
                                                                setExplaining({
                                                                    row,
                                                                    why: "locked",
                                                                })
                                                            }
                                                            // The server stamps its
                                                            // own clock; this is
                                                            // only what to show
                                                            // until it answers.
                                                            onStamp={() =>
                                                                setTime(
                                                                    row,
                                                                    step.field,
                                                                    new Date().toISOString(),
                                                                )
                                                            }
                                                            onSet={(value) =>
                                                                setTime(
                                                                    row,
                                                                    step.field,
                                                                    value,
                                                                )
                                                            }
                                                        />
                                                        ),
                                                    )}
    
                                                    <td className="stamp-cell">
                                                        {visitDuration(row)}
                                                    </td>
    
                                                    <td className="deferred-cell">
                                                        <input
                                                            type="checkbox"
                                                            checked={row.deferred}
                                                            aria-label={`Deferred: ${row.full_name}`}
                                                            onChange={(e) => {
                                                                if (row.attendance_cleared) {
                                                                    setExplaining({
                                                                        row,
                                                                        why: "locked",
                                                                    });
                                                                    return;
                                                                }
                                                                const deferred =
                                                                    e.target.checked;
                                                                run(
                                                                    row,
                                                                    { ...row, deferred },
                                                                    () =>
                                                                        setDeferred(
                                                                            row.id,
                                                                            deferred,
                                                                        ),
                                                                );
                                                            }}
                                                        />
                                                    </td>
    
                                                    {/* The clerk owns this column;
                                                        the desk only watches it. */}
                                                    {/* Students only: adults
                                                        have no class to be
                                                        marked out of, so there
                                                        is nothing for the clerk
                                                        to file. */}
                                                    <td className="attendance-cell">
                                                        {student && (
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    row.attendance_cleared
                                                                }
                                                                readOnly
                                                                className="checkbox-readonly"
                                                                aria-label={`Attendance filed: ${row.full_name}`}
                                                                onClick={() =>
                                                                    setExplaining({
                                                                        row,
                                                                        why: "clerk",
                                                                    })
                                                                }
                                                            />
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* Drawn over the table, not out of cell
                                    borders — see SlotRing. */}
                                {/* The selected block, outlined as one
                                    shape with whose selection it is. */}
                                <SelectionRing
                                    scrollRef={tableRef}
                                    selections={selections}
                                />

                                <SlotRing
                                    scrollRef={tableRef}
                                    rowSelector="tr[data-slot-now]"
                                    startSelector=".appointment-time"
                                    deps={[currentSlot, rows]}
                                />
                            </div>
                        </section>
                      </>
                    )}
                </div>
            </main>

            {confirmingClear && (
                <Modal
                    title="Clear these times?"
                    onClose={() => setConfirmingClear(null)}
                    actions={
                        <>
                            <button
                                type="button"
                                className="modal-btn"
                                onClick={() => setConfirmingClear(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="modal-btn primary"
                                onClick={clearSelected}
                            >
                                Clear {confirmingClear.cells} times
                            </button>
                        </>
                    }
                >
                    <p>
                        This empties {confirmingClear.cells} times across{" "}
                        {confirmingClear.byRow.size}{" "}
                        {confirmingClear.byRow.size === 1 ? "person" : "people"}
                        {confirmingClear.byRow.size <= 4 && (
                            <>
                                {" — "}
                                {[...confirmingClear.byRow.values()]
                                    .map(({ row }) => shortName(row.full_name))
                                    .join(", ")}
                            </>
                        )}
                        .
                    </p>
                    <p className="modal-note">
                        {confirmingClear.lockedOut > 0
                            ? `${confirmingClear.lockedOut} more will be left alone: their attendance is already filed. `
                            : ""}
                        ⌘Z puts them back.
                    </p>
                </Modal>
            )}

            {explaining?.why === "order" && (
                <Modal
                    title="Those times are out of order"
                    onClose={() => setExplaining(null)}
                >
                    <p>
                        {explaining.row.full_name}: {explaining.problem}
                    </p>
                    <p className="modal-note">
                        A donor arrives, visits the canteen, then leaves, so
                        the stamps have to run in that order. Nothing was
                        saved — check the time, or correct the one it clashes
                        with first.
                    </p>
                </Modal>
            )}

            {explaining?.why === "clerk" && (
                <Modal
                    title="The attendance clerk files this"
                    onClose={() => setExplaining(null)}
                >
                    <p>
                        Marking students off in the school's attendance system
                        is the attendance clerk's job, so this column is hers
                        to tick — the desk only watches it.
                    </p>
                    <p className="modal-note">
                        Once she files {explaining.row.full_name}, this box is
                        checked and the row turns dark, the way a deferral
                        does. The times are then part of that record and can't
                        be changed here.
                    </p>
                </Modal>
            )}

            {explaining?.why === "locked" && (
                <Modal
                    title="Attendance already filed"
                    onClose={() => setExplaining(null)}
                >
                    <p>
                        {explaining.row.full_name} has already been marked off
                        in the school's attendance system.
                    </p>
                    <p className="modal-note">
                        These times are part of that record. Ask the attendance
                        clerk to clear the attendance check before changing them.
                    </p>
                </Modal>
            )}
        </div>
    );
}
