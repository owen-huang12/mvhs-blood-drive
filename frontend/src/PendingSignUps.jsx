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

function PendingRow({
    signUp,
    onConfirm,
    onOverride,
    onCommit,
    isSlotFull,
    earliestOpen,
}) {
    const choices = [
        signUp.first_choice,
        signUp.second_choice,
        signUp.third_choice,
    ].filter(Boolean);

    // Nothing is preselected — the coordinator picks. The one exception is
    // when every choice is full, where we fall back to the earliest opening.
    const [picked, setPicked] = useState("");
    const [saving, setSaving] = useState(false);
    const rowRef = useRef(null);

    const allChoicesFull = choices.length > 0 && choices.every(isSlotFull);
    const autoAssigned = !picked && allChoicesFull && Boolean(earliestOpen);
    const slot = picked || (autoAssigned ? earliestOpen : "");

    // Anything outside the person's three stored choices — whether picked
    // manually from "Assign any time" or defaulted to the earliest opening
    // because all three were full — is a coordinator override. The strict
    // /confirm endpoint would 400 on either, so those go through /slot
    // instead, same as drag-and-drop.
    const isOverride = Boolean(slot) && !choices.includes(slot);

    async function handleConfirm() {
        if (!slot) return;
        setSaving(true);
        let updated;
        try {
            updated = isOverride
                ? await onOverride(signUp.id, slot)
                : await onConfirm(signUp.id, slot);
        } catch {
            setSaving(false);
            return;
        }

        await collapseRow(rowRef.current);
        onCommit(updated);
    }

    return (
        <div className="pending-row" ref={rowRef}>
            <span className="pending-name">{signUp.full_name}</span>
            <span className="pending-meta">{signUp.student_id}</span>
            <span className="pending-meta">
                {signUp.is_student ? "Student" : "Teacher"}
            </span>
            <span className="pending-meta">{signUp.age}</span>

            <SlotPicker
                choices={choices}
                value={slot}
                onChange={setPicked}
                isFull={isSlotFull}
                autoAssigned={autoAssigned}
                disabled={saving}
            />
            
            <div className="confirm-cell">
                <button
                    type="button"
                    className="confirm-btn"
                    onClick={handleConfirm}
                    disabled={saving || !slot}
                    title={slot ? undefined : "Pick a time slot first"}
                >
                    {saving ? "confirming…" : "confirm"}
                </button>
            </div>
        </div>
    );
}

export default function PendingSignUps({
    signUps,
    onConfirm,
    onOverride,
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
                    <div className="pending-header" aria-hidden="true">
                        <span>Full Name</span>
                        <span>Student ID</span>
                        <span>Status</span>
                        <span>Age</span>
                        <span>Time Slot</span>
                        <span />
                    </div>
                    {signUps.map((signUp) => (
                        <PendingRow
                            key={signUp.id}
                            signUp={signUp}
                            onConfirm={onConfirm}
                            onOverride={onOverride}
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
