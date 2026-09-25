import { useState } from "react";
import Header from "./Header.jsx";
import Spinner from "./Spinner.jsx";
import Modal from "./Modal.jsx";
import TimeStampCell from "./TimeStampCell.jsx";
import useLiveSignUps from "./useLiveSignUps.js";
import { participantOf } from "./participants.js";
import { colorsForPeriod, parseSlot, slotOrder } from "./timeSlots.js";
import { setDeferred, stampDayOf } from "./api.js";
import { visitDuration } from "./dayOf.js";

/** The stamps the desk records, in the order a donor passes through them.
    Time in the canteen isn't stamped — it falls out of these two. */
const STEPS = [
    { field: "time_in", label: "In" },
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
    const [busyId, setBusyId] = useState(null);
    // The student whose times the desk tried to change after filing.
    const [lockedRow, setLockedRow] = useState(null);

    const rows = signUps
        .filter((signUp) => signUp.confirmed)
        .sort(
            (a, b) =>
                slotOrder(a.time_slot) - slotOrder(b.time_slot) ||
                a.full_name.localeCompare(b.full_name),
        );

    const run = async (id, action) => {
        setBusyId(id);
        try {
            applyUpdate(await action());
            setError("");
        } catch (err) {
            setError(
                err.status === 403
                    ? "Day-of features are not open yet."
                    : "Could not save that. Please try again.",
            );
        } finally {
            setBusyId(null);
        }
    };

    const arrived = rows.filter((row) => row.time_in).length;

    return (
        <div className="dashboard-page">
            <Header />
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

                            <table className="appointment-table day-of-table">
                                <thead>
                                    <tr>
                                        <th>Period</th>
                                        <th>App. Time</th>
                                        <th>Full Name</th>
                                        <th>Status</th>
                                        <th>Time In Appt.</th>
                                        <th>Time Out</th>
                                        <th>Time In Canteen</th>
                                        <th>Deferred?</th>
                                        <th>Attendance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => {
                                        const slot = parseSlot(row.time_slot);
                                        const person = participantOf(row);
                                        const busy = busyId === row.id;

                                        return (
                                            <tr
                                                key={row.id}
                                                className={
                                                    row.deferred ? "row-deferred" : ""
                                                }
                                            >
                                                <td
                                                    className="period-cell"
                                                    style={{
                                                        backgroundColor: colorsForPeriod(
                                                            slot.period,
                                                        ).bg,
                                                    }}
                                                >
                                                    {slot.period}
                                                </td>
                                                <td className="appointment-time">
                                                    {slot.time}
                                                </td>
                                                <td>{row.full_name}</td>
                                                <td
                                                    className="status-cell"
                                                    style={{
                                                        backgroundColor: person.bg,
                                                        color: person.text,
                                                    }}
                                                >
                                                    {person.label}
                                                </td>

                                                {STEPS.map((step) => (
                                                    <TimeStampCell
                                                        key={step.field}
                                                        value={row[step.field]}
                                                        label={step.label}
                                                        busy={busy}
                                                        locked={row.attendance_cleared}
                                                        onLocked={() => setLockedRow(row)}
                                                        onStamp={() =>
                                                            run(row.id, () =>
                                                                stampDayOf(row.id, step.field),
                                                            )
                                                        }
                                                        onSet={(value) =>
                                                            run(row.id, () =>
                                                                stampDayOf(
                                                                    row.id,
                                                                    step.field,
                                                                    value,
                                                                ),
                                                            )
                                                        }
                                                    />
                                                ))}

                                                <td className="stamp-cell">
                                                    {visitDuration(row)}
                                                </td>

                                                <td className="deferred-cell">
                                                    <input
                                                        type="checkbox"
                                                        checked={row.deferred}
                                                        disabled={busy}
                                                        aria-label={`Deferred: ${row.full_name}`}
                                                        onChange={(e) => {
                                                            if (row.attendance_cleared) {
                                                                setLockedRow(row);
                                                                return;
                                                            }
                                                            run(row.id, () =>
                                                                setDeferred(
                                                                    row.id,
                                                                    e.target.checked,
                                                                ),
                                                            );
                                                        }}
                                                    />
                                                </td>

                                                {/* The clerk owns this column;
                                                    the desk only watches it. */}
                                                <td className="attendance-cell">
                                                    <input
                                                        type="checkbox"
                                                        checked={row.attendance_cleared}
                                                        readOnly
                                                        className="checkbox-readonly"
                                                        aria-label={`Attendance filed: ${row.full_name}`}
                                                        onClick={() => setLockedRow(row)}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </section>
                    )}
                </div>
            </main>

            {lockedRow && (
                <Modal
                    title="Attendance already filed"
                    onClose={() => setLockedRow(null)}
                >
                    <p>
                        {lockedRow.full_name} has already been marked off in the
                        school's attendance system.
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
