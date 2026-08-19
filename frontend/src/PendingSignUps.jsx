import { useRef, useState } from "react";
import { animate } from "animejs";
import SlotPicker from "./SlotPicker.jsx";

/** Promise-wrapped animate() so steps can be awaited in sequence. */
const run = (targets, params) =>
    new Promise((resolve) => animate(targets, { ...params, onComplete: resolve }));

/** Collapse a row to nothing, including the margin that separates it. */
function collapseRow(el) {
    el.style.overflow = "hidden";
    el.style.height = `${el.offsetHeight}px`;
    return run(el, {
        height: 0,
        opacity: 0,
        marginTop: 0,
        paddingTop: 0,
        paddingBottom: 0,
        duration: 340,
        ease: "inOutQuad",
    });
}

function PendingRow({ signUp, onConfirm, onCommit, isSlotFull, earliestOpen }) {
    const choices = [
        signUp.first_choice,
        signUp.second_choice,
        signUp.third_choice,
    ].filter(Boolean);

    // Nothing is preselected — the coordinator picks. The one exception is
    // when every choice is full, where we fall back to the earliest opening.
    const [picked, setPicked] = useState("");
    const [status, setStatus] = useState("idle"); // idle | saving | done
    const rowRef = useRef(null);
    const pillRef = useRef(null);

    const allChoicesFull = choices.length > 0 && choices.every(isSlotFull);
    const autoAssigned = !picked && allChoicesFull && Boolean(earliestOpen);
    const slot = picked || (autoAssigned ? earliestOpen : "");

    const busy = status !== "idle";

    async function handleConfirm() {
        if (!slot) return;
        setStatus("saving");
        let updated;
        try {
            updated = await onConfirm(signUp.id, slot);
        } catch {
            setStatus("idle");
            return;
        }

        // Flip the pill to green, let it land, then collapse the row away.
        setStatus("done");
        await run(pillRef.current, {
            scale: [1, 1.14, 1],
            duration: 420,
            ease: "outBack",
        });
        await collapseRow(rowRef.current);
        onCommit(updated);
    }

    return (
        <div className="pending-row" ref={rowRef}>
            <span className="pending-name">{signUp.full_name}</span>
            <span className="pending-meta">
                {signUp.is_student ? "Student" : "Teacher"}
            </span>
            <span className="pending-meta">{signUp.student_id}</span>
            <span className="pending-meta">Age: {signUp.age}</span>

            <span className="pending-slot-label">Time Slot:</span>
            <SlotPicker
                choices={choices}
                value={slot}
                onChange={setPicked}
                isFull={isSlotFull}
                autoAssigned={autoAssigned}
                disabled={busy}
            />

            <button
                type="button"
                className="confirm-btn"
                onClick={handleConfirm}
                disabled={busy || !slot}
                title={slot ? undefined : "Pick a time slot first"}
            >
                {status === "saving" ? "confirming…" : "confirm"}
            </button>

            <span
                ref={pillRef}
                className={`status-pill ${status === "done" ? "done" : "awaiting"}`}
            >
                {status === "done" ? "confirmed" : "awaiting confirmation"}
            </span>
        </div>
    );
}

export default function PendingSignUps({
    signUps,
    onConfirm,
    onCommit,
    isSlotFull,
    earliestOpen,
}) {
    return (
        <section className="dash-section">
            <h3 className="dash-heading">
                Pending:
                <span className="count-badge amber">{signUps.length}</span>
            </h3>

            {signUps.length === 0 ? (
                <p className="empty-state">Nothing awaiting confirmation.</p>
            ) : (
                <div className="pending-list">
                    {signUps.map((signUp) => (
                        <PendingRow
                            key={signUp.id}
                            signUp={signUp}
                            onConfirm={onConfirm}
                            onCommit={onCommit}
                            isSlotFull={isSlotFull}
                            earliestOpen={earliestOpen}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
