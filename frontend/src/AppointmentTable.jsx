import { useState } from "react";
import CapacityPicker from "./CapacityPicker.jsx";
import { isStudent, participantOf } from "./participants.js";
import {
    buildSchedule,
    colorsForPeriod,
    countOpenSlots,
    isSlotFull,
} from "./timeSlots.js";

const DRAG_TYPE = "application/x-signup-id";

export default function AppointmentTable({
    signUps,
    capacity,
    onUnconfirm,
    onMove,
    onSlotFull,
    onCapacityChange,
    busyId,
}) {
    const [draggingId, setDraggingId] = useState(null);
    const [dropSlot, setDropSlot] = useState(null);
    // The period whose capacity panel is open, plus where to anchor it.
    const [capacityMenu, setCapacityMenu] = useState(null);

    const groups = buildSchedule(signUps, capacity);
    const openCount = countOpenSlots(signUps, capacity);

    /** A slot blocks the drop when it is full, unless the dragged row is already in it. */
    const blocks = (slotKey) => {
        const dragged = signUps.find((signUp) => signUp.id === draggingId);
        if (dragged && dragged.time_slot === slotKey) return false;
        return isSlotFull(signUps, slotKey, capacity);
    };

    /** Right-clicking a period opens its capacity panel instead of the browser menu. */
    const handlePeriodContextMenu = (event, period) => {
        // "Unscheduled" is a catch-all for off-schedule rows, not a real
        // period, so it has no positions to add or remove.
        if (period === "Unscheduled") return;
        event.preventDefault();
        setCapacityMenu({ period, x: event.clientX, y: event.clientY });
    };

    const handleDragStart = (event, id) => {
        // The period label isn't the drag handle — only the grip/name area is.
        if (event.target.closest?.(".period-cell")) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.setData(DRAG_TYPE, String(id));
        event.dataTransfer.effectAllowed = "move";
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
                        const periodBg = colorsForPeriod(group.period).bg;
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
                                    <td
                                        className={`period-cell${
                                            droppable ? " has-capacity-menu" : ""
                                        }`}
                                        style={{ backgroundColor: periodBg }}
                                        onContextMenu={(e) =>
                                            handlePeriodContextMenu(e, group.period)
                                        }
                                        title={
                                            droppable
                                                ? "Right-click to add or remove positions"
                                                : undefined
                                        }
                                    >
                                        {group.period}
                                    </td>

                                    <td className="appointment-time">{row.time}</td>

                                    {!booked ? (
                                        <td colSpan={5} />
                                    ) : (
                                        <>
                                            <td className="drag-name">
                                                <span className="drag-grip" aria-hidden="true">
                                                    ⠿
                                                </span>
                                                {row.signUp.full_name}
                                            </td>
                                            {(() => {
                                                const person = participantOf(row.signUp);
                                                // Only students have an ID to
                                                // show, so for everyone else
                                                // the status runs across both
                                                // columns rather than sitting
                                                // beside an empty cell.
                                                const hasId = isStudent(row.signUp);
                                                return (
                                                    <>
                                                        <td
                                                            className="status-cell"
                                                            colSpan={hasId ? 1 : 2}
                                                            style={{
                                                                backgroundColor: person.bg,
                                                                color: person.text,
                                                            }}
                                                        >
                                                            {person.label}
                                                        </td>
                                                        {hasId && (
                                                            <td>{row.signUp.student_id}</td>
                                                        )}
                                                    </>
                                                );
                                            })()}
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

            {capacityMenu && (
                <CapacityPicker
                    period={capacityMenu.period}
                    anchor={{ x: capacityMenu.x, y: capacityMenu.y }}
                    signUps={signUps}
                    capacity={capacity}
                    onChange={onCapacityChange}
                    onClose={() => setCapacityMenu(null)}
                />
            )}
        </section>
    );
}
