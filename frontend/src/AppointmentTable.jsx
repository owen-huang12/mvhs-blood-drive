import { useState } from "react";
import {
    buildSchedule,
    colorsForPeriod,
    countOpenSlots,
    isSlotFull,
} from "./timeSlots.js";

const DRAG_TYPE = "application/x-signup-id";

/**
 * Replace the drag ghost for a group's first row.
 *
 * That row owns the period cell, which spans the whole group via rowspan, so
 * the browser's default ghost renders as tall as the entire period. The clone
 * keeps the cell but collapses it to a single row, and pins every column to
 * its on-screen width so the ghost lines up with the table underneath it.
 */
function setRowDragImage(event) {
    const row = event.currentTarget;
    const periodCell = row.querySelector(".period-cell");
    // Rows without a period cell already produce a correct one-row ghost.
    if (!periodCell) return;

    const clone = row.cloneNode(true);
    clone.querySelector(".period-cell").rowSpan = 1;
    Array.from(row.children).forEach((cell, index) => {
        clone.children[index].style.width = `${cell.offsetWidth}px`;
    });

    const ghost = document.createElement("table");
    ghost.className = "appointment-table drag-ghost";
    ghost.style.width = `${row.offsetWidth}px`;
    const body = document.createElement("tbody");
    body.appendChild(clone);
    ghost.appendChild(body);
    document.body.appendChild(ghost);

    const rect = row.getBoundingClientRect();
    event.dataTransfer.setDragImage(
        ghost,
        event.clientX - rect.left,
        event.clientY - rect.top,
    );
    // The ghost is snapshotted at the end of this frame, so it can only be
    // removed once that has happened.
    requestAnimationFrame(() => ghost.remove());
}

export default function AppointmentTable({
    signUps,
    onUnconfirm,
    onMove,
    onSlotFull,
    busyId,
}) {
    const [draggingId, setDraggingId] = useState(null);
    const [dropSlot, setDropSlot] = useState(null);

    const groups = buildSchedule(signUps);
    const openCount = countOpenSlots(signUps);

    /** A slot blocks the drop when it is full, unless the dragged row is already in it. */
    const blocks = (slotKey) => {
        const dragged = signUps.find((signUp) => signUp.id === draggingId);
        if (dragged && dragged.time_slot === slotKey) return false;
        return isSlotFull(signUps, slotKey);
    };

    const handleDragStart = (event, id) => {
        // The period cell belongs to the group, not to this row — dragging it
        // would silently move whichever row happens to be first in the period.
        if (event.target.closest?.(".period-cell")) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.setData(DRAG_TYPE, String(id));
        event.dataTransfer.effectAllowed = "move";
        setRowDragImage(event);
        setDraggingId(id);
    };

    const handleDragEnd = () => {
        setDraggingId(null);
        setDropSlot(null);
    };

    const handleDragOver = (event, slotKey) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        // Required, otherwise the browser refuses the drop.
        event.preventDefault();
        event.dataTransfer.dropEffect = blocks(slotKey) ? "none" : "move";
        setDropSlot(slotKey);
    };

    const handleDrop = (event, slotKey) => {
        event.preventDefault();
        const id = Number(event.dataTransfer.getData(DRAG_TYPE));
        const wasBlocked = blocks(slotKey);
        setDraggingId(null);
        setDropSlot(null);

        const moved = signUps.find((signUp) => signUp.id === id);
        if (!moved || moved.time_slot === slotKey) return;
        if (wasBlocked) {
            onSlotFull(slotKey);
            return;
        }
        onMove(id, slotKey);
    };

    return (
        <section className="dash-section">
            <h3 className="dash-heading">
                Appointment Slotting:
                <span className="count-badge green">{signUps.length} booked</span>
                <span className="count-badge grey">{openCount} open</span>
            </h3>

            <table className="appointment-table">
                <thead>
                    <tr>
                        <th>Period</th>
                        <th>App. Time</th>
                        <th>Full Name</th>
                        <th>Status</th>
                        <th>Student ID</th>
                        <th>Primary Email</th>
                        <th aria-label="Actions" />
                    </tr>
                </thead>
                <tbody>
                    {groups.map((group) => {
                        const colors = colorsForPeriod(group.period);
                        // "Unscheduled" rows aren't real slots, so nothing may drop there.
                        const droppable = group.period !== "Unscheduled";

                        return group.rows.map((row, index) => {
                            const booked = row.kind === "booked";
                            const isDragging = booked && row.signUp.id === draggingId;
                            const isTarget = droppable && dropSlot === row.key;

                            return (
                                <tr
                                    key={booked ? row.signUp.id : `${row.key}#${row.seat}`}
                                    className={[
                                        index === 0 ? "period-start" : "",
                                        booked ? "" : "slot-open",
                                        isDragging ? "row-dragging" : "",
                                        isTarget && !blocks(row.key) ? "row-drop" : "",
                                        isTarget && blocks(row.key) ? "row-drop-blocked" : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    draggable={booked}
                                    onDragStart={
                                        booked
                                            ? (e) => handleDragStart(e, row.signUp.id)
                                            : undefined
                                    }
                                    onDragEnd={booked ? handleDragEnd : undefined}
                                    onDragOver={
                                        droppable ? (e) => handleDragOver(e, row.key) : undefined
                                    }
                                    onDrop={
                                        droppable ? (e) => handleDrop(e, row.key) : undefined
                                    }
                                >
                                    {index === 0 && (
                                        <td
                                            className="period-cell"
                                            rowSpan={group.rows.length}
                                            style={{
                                                backgroundColor: colors.bg,
                                                color: colors.text,
                                            }}
                                        >
                                            {group.period}
                                        </td>
                                    )}

                                    <td className="appointment-time">{row.time}</td>

                                    {!booked ? (
                                        <td className="open-label" colSpan={5}>
                                            Available
                                        </td>
                                    ) : (
                                        <>
                                            <td className="drag-name">
                                                <span className="drag-grip" aria-hidden="true">
                                                    ⠿
                                                </span>
                                                {row.signUp.full_name}
                                            </td>
                                            <td
                                                className="status-cell"
                                                style={{
                                                    backgroundColor: row.signUp.is_student
                                                        ? "#E3F0FA"
                                                        : "#F3E8FA",
                                                    color: row.signUp.is_student
                                                        ? "#3E7793"
                                                        : "#7B5AA6",
                                                }}
                                            >
                                                {row.signUp.is_student ? "Student" : "Teacher"}
                                            </td>
                                            <td>
                                                {row.signUp.is_student
                                                    ? row.signUp.student_id
                                                    : ""}
                                            </td>
                                            <td className="appointment-email">
                                                {row.signUp.email_address}
                                            </td>
                                            <td className="appointment-actions">
                                                <button
                                                    type="button"
                                                    className="unconfirm-btn"
                                                    onClick={() => onUnconfirm(row.signUp.id)}
                                                    disabled={busyId === row.signUp.id}
                                                    title="Move back to pending"
                                                >
                                                    undo
                                                </button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        });
                    })}
                </tbody>
            </table>
        </section>
    );
}
