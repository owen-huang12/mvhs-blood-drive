import { useState } from "react";
import Header from "./Header.jsx";
import Spinner from "./Spinner.jsx";
import useLiveSignUps from "./useLiveSignUps.js";
import { isStudent, participantOf } from "./participants.js";
import { colorsForPeriod, parseSlot, slotOrder } from "./timeSlots.js";
import { formatStamp, needsFiling, visitDuration } from "./dayOf.js";
import { setAttendance } from "./api.js";

/**
 * The attendance clerk's worklist.
 *
 * Read-only on everything the check-in desk owns; the one thing she writes is
 * whether a student has been entered into the school's attendance system.
 * No health information appears anywhere on the page.
 *
 * Teachers and community members are listed too — she needs to know who is
 * out of the building — but they have no class to be marked out of, so their
 * attendance cell stays empty and they are left out of the filing count.
 */
export default function AttendanceClerk() {
    const { signUps, loading, error, setError, applyUpdate } = useLiveSignUps();
    const [busyId, setBusyId] = useState(null);

    const rows = signUps
        .filter((signUp) => signUp.confirmed)
        .sort(
            (a, b) =>
                slotOrder(a.time_slot) - slotOrder(b.time_slot) ||
                a.full_name.localeCompare(b.full_name),
        );

    // Only students are filed with the school, so only they can be outstanding.
    const outstanding = rows.filter(
        (row) => isStudent(row) && needsFiling(row),
    ).length;

    const toggle = async (row, cleared) => {
        setBusyId(row.id);
        try {
            applyUpdate(await setAttendance(row.id, cleared));
            setError("");
        } catch (err) {
            setError(
                err.status === 403
                    ? "Attendance filing is not open yet."
                    : "Could not save that. Please try again.",
            );
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="dashboard-page">
            <Header />
            <main className="dashboard-content">
                <h2 className="dashboard-section-title">Attendance</h2>

                <div className="dashboard-body">
                    {error && <p className="login-error">{error}</p>}

                    {loading ? (
                        <Spinner label="Loading students…" />
                    ) : (
                        <section className="dash-section">
                            <h3 className="dash-heading">
                                Students:
                                <span className="count-badge grey">
                                    {outstanding} to file
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
                                            <th className="stamp-cell">Time Out</th>
                                            <th className="stamp-cell">Canteen</th>
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
                                            // slot reads as part of its period
                                            // — the coordinator table's rule.
                                            const timeBg = `color-mix(in srgb, ${periodBg} 50%, #fff)`;

                                            // One period cell per run of rows
                                            // in the same period, and one time
                                            // cell per run in the same slot,
                                            // the way the coordinator table
                                            // groups them.
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
                                                        student && needsFiling(row)
                                                            ? "row-needs-filing"
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
                                                            {/* How many people
                                                                are in this slot,
                                                                beside its time. */}
                                                            <span className="slot-count">
                                                                (x{slotRows})
                                                            </span>
                                                        </td>
                                                    )}
                                                    <td className="name-cell">
                                                        {row.full_name}
                                                    </td>
                                                    {/* Titled because it is
                                                        capped: a long address
                                                        is still readable on
                                                        hover. */}
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
                                                        or an ID. For everyone else
                                                        a ruled line says "not
                                                        applicable", which an empty
                                                        cell reads as "not filled in
                                                        yet". Drawn rather than typed
                                                        so it spans whatever width
                                                        the column ends up at. */}
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
                                                    <td className="stamp-cell">
                                                        {formatStamp(row.time_in)}
                                                    </td>
                                                    <td className="stamp-cell">
                                                        {formatStamp(row.time_out)}
                                                    </td>
                                                    <td className="stamp-cell">
                                                        {visitDuration(row)}
                                                    </td>
                                                    <td className="deferred-cell">
                                                        {row.deferred ? "Yes" : ""}
                                                    </td>
                                                    <td className="attendance-cell">
                                                        {student && (
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    row.attendance_cleared
                                                                }
                                                                disabled={busyId === row.id}
                                                                aria-label={`Attendance filed: ${row.full_name}`}
                                                                onChange={(e) =>
                                                                    toggle(
                                                                        row,
                                                                        e.target.checked,
                                                                    )
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
        </div>
    );
}
