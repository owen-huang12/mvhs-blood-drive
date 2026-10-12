import { useRef } from "react";
import Header from "./Header.jsx";
import ProfilePill from "./ProfilePill.jsx";
import Spinner from "./Spinner.jsx";
import SlotRing from "./SlotRing.jsx";
import useLiveSignUps from "./useLiveSignUps.js";
import useCurrentSlot from "./useCurrentSlot.js";
import { isStudent, participantOf } from "./participants.js";
import {
    SLOT_TIMES,
    colorsForPeriod,
    parseSlot,
    slotOrder,
} from "./timeSlots.js";
import {
    classForSlot,
    formatStamp,
    isVisitComplete,
    needsFiling,
    readyToFile,
    skipsCanteen,
    visitDuration,
} from "./dayOf.js";
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
    // Moves on by itself as the drive runs.
    const currentSlot = useCurrentSlot(SLOT_TIMES);
    // The box the ring is measured against and drawn inside.
    const tableRef = useRef(null);

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

    /**
     * Tick or untick a row, showing it immediately.
     *
     * The box is filled before the request goes out, and put back if the
     * request fails. She works down a list of a hundred names faster than the
     * round trip, and a box that only fills once the server answers is a box
     * she clicks twice.
     */
    const toggle = async (row, cleared) => {
        applyUpdate({ ...row, attendance_cleared: cleared });
        setError("");
        try {
            // The row that comes back is authoritative — it carries anything
            // the check-in desk changed while this was in flight.
            applyUpdate(await setAttendance(row.id, cleared));
        } catch (err) {
            // Roll back to what was on screen before the click. Written from
            // `row` rather than by flipping the current value, so a stream
            // update that landed meanwhile isn't undone along with it.
            applyUpdate(row);
            setError(
                err.status === 403
                    ? "Attendance filing is not open yet."
                    : "Could not save that. Please try again.",
            );
        }
    };

    return (
        <div className="dashboard-page">
            <Header>
                <ProfilePill />
            </Header>

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

                            <div className="table-scroll" ref={tableRef}>
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
                                                        // Done donating but
                                                        // not yet filed: her
                                                        // queue.
                                                        readyToFile(row, student)
                                                            ? "row-needs-filing"
                                                            : "",
                                                        // Done: reads the same
                                                        // way on both pages.
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
                                                    {/* The same three times the
                                                        desk stamps, in the order a
                                                        donor passes through them,
                                                        then how long it took. */}
                                                    <td className="stamp-cell">
                                                        {formatStamp(row.time_in)}
                                                    </td>
                                                    <td className="stamp-cell">
                                                        {skipsCanteen(row) ? (
                                                            <span
                                                                className="not-applicable"
                                                                title="Deferred — no canteen visit"
                                                            />
                                                        ) : (
                                                            formatStamp(row.time_canteen)
                                                        )}
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

                                {/* Drawn over the table, not out of cell
                                    borders — see SlotRing. */}
                                <SlotRing
                                    scrollRef={tableRef}
                                    rowSelector="tr[data-slot-now]"
                                    startSelector=".appointment-time"
                                    deps={[currentSlot, rows]}
                                />
                            </div>
                        </section>
                    )}
                </div>
            </main>
        </div>
    );
}
