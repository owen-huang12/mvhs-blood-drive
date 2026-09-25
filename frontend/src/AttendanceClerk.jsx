import { useState } from "react";
import Header from "./Header.jsx";
import Spinner from "./Spinner.jsx";
import useLiveSignUps from "./useLiveSignUps.js";
import { isStudent } from "./participants.js";
import { colorsForPeriod, parseSlot, slotOrder } from "./timeSlots.js";
import { formatStamp, needsFiling, visitDuration } from "./dayOf.js";
import { setAttendance } from "./api.js";

/**
 * The attendance clerk's worklist.
 *
 * Read-only on everything the check-in desk owns; the one thing she writes is
 * whether a student has been entered into the school's attendance system.
 * Students only — adults have no class to be marked out of — and no health
 * information anywhere on the page.
 */
export default function AttendanceClerk() {
    const { signUps, loading, error, setError, applyUpdate } = useLiveSignUps();
    const [busyId, setBusyId] = useState(null);

    const rows = signUps
        .filter((signUp) => signUp.confirmed && isStudent(signUp))
        .sort(
            (a, b) =>
                slotOrder(a.time_slot) - slotOrder(b.time_slot) ||
                a.full_name.localeCompare(b.full_name),
        );

    const outstanding = rows.filter(needsFiling).length;

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

                            <table className="appointment-table day-of-table">
                                <thead>
                                    <tr>
                                        <th>Period</th>
                                        <th>App. Time</th>
                                        <th>Full Name</th>
                                        <th>Student ID</th>
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

                                        return (
                                            <tr
                                                key={row.id}
                                                className={
                                                    needsFiling(row) ? "row-needs-filing" : ""
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
                                                <td>{row.student_id}</td>
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
                                                    <input
                                                        type="checkbox"
                                                        checked={row.attendance_cleared}
                                                        disabled={busyId === row.id}
                                                        aria-label={`Attendance filed: ${row.full_name}`}
                                                        onChange={(e) =>
                                                            toggle(row, e.target.checked)
                                                        }
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
        </div>
    );
}
