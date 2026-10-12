import { useEffect, useState } from "react";
import Header from "./Header.jsx";
import ProfilePill from "./ProfilePill.jsx";
import Spinner from "./Spinner.jsx";
import Modal from "./Modal.jsx";
import TimeStampCell from "./TimeStampCell.jsx";
import useLiveSignUps from "./useLiveSignUps.js";
import { isStudent, participantOf } from "./participants.js";
import { colorsForPeriod, parseSlot, slotOrder } from "./timeSlots.js";
import { getCurrentCoordinator, setDeferred, stampDayOf } from "./api.js";
import {
    isVisitComplete,
    skipsCanteen,
    timeOrderError,
    visitDuration,
} from "./dayOf.js";

/** The stamps the desk records, in the order a donor passes through them. */
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
    const { signUps, loading, error, setError, applyUpdate } = useLiveSignUps();
    const [name, setName] = useState("");
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
            .then((me) => !cancelled && setName(me.full_name))
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const rows = signUps
        .filter((signUp) => signUp.confirmed)
        .sort(
            (a, b) =>
                slotOrder(a.time_slot) - slotOrder(b.time_slot) ||
                a.full_name.localeCompare(b.full_name),
        );

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
            applyUpdate(await action());
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
                setError(`${row.full_name}: ${problem}`);
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
                <ProfilePill name={name} />
            </Header>
            <main className="dashboard-content">
                <h2 className="dashboard-section-title">Check-In Station</h2>

                <div className="dashboard-body">
                    {error && <p className="login-error">{error}</p>}

                    {loading ? (
                        <Spinner label="Loading appointments…" />
                    ) : (
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

                            <div className="table-scroll">
                                <table className="appointment-table day-of-table attendance-table">
                                    <thead>
                                        <tr>
                                            <th>Period</th>
                                            <th>App. Time</th>
                                            <th>Full Name</th>
                                            <th>Email</th>
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
                                                    className={[
                                                        startsPeriod ? "period-start" : "",
                                                        // Dimmed only once there
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
                                                    <td
                                                        className="appointment-email"
                                                        title={row.email_address}
                                                    >
                                                        {row.email_address}
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
                            </div>
                        </section>
                    )}
                </div>
            </main>

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
