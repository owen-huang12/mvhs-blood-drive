import { useRef, useState } from "react";
import { animate } from "animejs";
import { colorsForPeriod, parseSlot } from "./timeSlots.js";

const CHOICE_SUFFIX = [" (1st)", " (2nd)", " (3rd)"];

const displaySlot = (value) => {
    const { period, time } = parseSlot(value);
    return time ? `${period}: ${time}` : period;
};

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

function PendingRow({ signUp, onConfirm, onCommit }) {
    // De-duplicated so a person who picked the same slot twice doesn't get
    // repeated options.
    const choices = [
        ...new Set([signUp.first_choice, signUp.second_choice, signUp.third_choice]),
    ].filter(Boolean);

    const [slot, setSlot] = useState(choices[0] ?? signUp.time_slot);
    const [status, setStatus] = useState("idle"); // idle | saving | done
    const rowRef = useRef(null);
    const pillRef = useRef(null);

    const colors = colorsForPeriod(parseSlot(slot).period);
    const busy = status !== "idle";

    async function handleConfirm() {
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

            <label className="pending-slot-label" htmlFor={`slot-${signUp.id}`}>
                Time Slot:
            </label>
            <select
                id={`slot-${signUp.id}`}
                className="slot-select"
                style={{ backgroundColor: colors.bg, color: colors.text }}
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                disabled={busy}
            >
                {choices.map((choice, index) => (
                    <option key={choice} value={choice}>
                        {displaySlot(choice)}
                        {CHOICE_SUFFIX[index]}
                    </option>
                ))}
            </select>

            <button
                type="button"
                className="confirm-btn"
                onClick={handleConfirm}
                disabled={busy}
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

export default function PendingSignUps({ signUps, onConfirm, onCommit }) {
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
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
