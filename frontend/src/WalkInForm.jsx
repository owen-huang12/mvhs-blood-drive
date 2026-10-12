import { useState } from "react";
import { PARTICIPANTS } from "./participants.js";
import { TIME_SLOTS, formatSlot, parseSlot } from "./timeSlots.js";
import { addWalkIn } from "./api.js";

const GRADES = ["9th", "10th", "11th", "12th"];
const MIN_AGE = 16;

const EMPTY = {
    full_name: "",
    preferred_name: "",
    email_address: "",
    participant_type: "student",
    student_id: "",
    age: "",
    grade: "",
};

/**
 * Add someone who turned up without booking, from the check-in desk.
 *
 * Collapsed to a single button until it is needed: the table is the page,
 * and a walk-in is the exception. The slot defaults to the one being served,
 * which is nearly always right — they are standing at the table.
 *
 * Students give an ID, age and grade; teachers and community members give
 * none of the three, so those fields are hidden rather than left blank.
 */
export default function WalkInForm({ currentSlot, onAdded }) {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [slot, setSlot] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const student = form.participant_type === "student";
    // The slot being served, until the desk picks another.
    const chosenSlot =
        slot || TIME_SLOTS.map(formatSlot).find(
            (key) => parseSlot(key).time === currentSlot,
        ) || "";

    const set = (field) => (event) =>
        setForm((prev) => ({ ...prev, [field]: event.target.value }));

    const close = () => {
        setOpen(false);
        setForm(EMPTY);
        setSlot("");
        setError("");
    };

    const submit = async (event) => {
        event.preventDefault();
        if (!chosenSlot) {
            setError("Pick a time slot.");
            return;
        }
        if (student && Number(form.age) < MIN_AGE) {
            setError(`Donors must be at least ${MIN_AGE} years old.`);
            return;
        }

        setSaving(true);
        try {
            const created = await addWalkIn({
                full_name: form.full_name,
                preferred_name: form.preferred_name || null,
                email_address: form.email_address,
                participant_type: form.participant_type,
                time_slot: chosenSlot,
                // Cleared for adults; the server ignores them either way.
                student_id: student ? form.student_id : null,
                age: student ? Number(form.age) : null,
                grade: student ? form.grade : null,
            });
            onAdded(created);
            close();
        } catch (err) {
            setError(
                err.status === 409
                    ? err.message
                    : err.status === 422
                      ? "Check the details and try again."
                      : "Could not add them. Please try again.",
            );
        } finally {
            setSaving(false);
        }
    };

    if (!open) {
        return (
            <div className="walk-in-bar">
                <button
                    type="button"
                    className="walk-in-open"
                    onClick={() => setOpen(true)}
                >
                    + Add a walk-in
                </button>
            </div>
        );
    }

    return (
        <form className="walk-in-form" onSubmit={submit}>
            <div className="walk-in-head">
                <h3 className="dash-heading">Add a walk-in</h3>
                <button type="button" className="walk-in-cancel" onClick={close}>
                    Cancel
                </button>
            </div>

            <div className="walk-in-grid">
                <label className="walk-in-field walk-in-wide">
                    <span>Full legal name</span>
                    <input
                        value={form.full_name}
                        onChange={set("full_name")}
                        maxLength={50}
                        required
                        autoFocus
                    />
                </label>

                <label className="walk-in-field">
                    <span>Preferred name</span>
                    <input
                        value={form.preferred_name}
                        onChange={set("preferred_name")}
                        maxLength={50}
                    />
                </label>

                <label className="walk-in-field walk-in-wide">
                    <span>Email</span>
                    <input
                        type="email"
                        value={form.email_address}
                        onChange={set("email_address")}
                        maxLength={100}
                        required
                    />
                </label>

                <label className="walk-in-field">
                    <span>Status</span>
                    <select
                        value={form.participant_type}
                        onChange={set("participant_type")}
                    >
                        {Object.entries(PARTICIPANTS).map(([value, person]) => (
                            <option key={value} value={value}>
                                {person.label}
                            </option>
                        ))}
                    </select>
                </label>

                {student && (
                    <>
                        <label className="walk-in-field">
                            <span>Student ID</span>
                            <input
                                value={form.student_id}
                                onChange={set("student_id")}
                                maxLength={10}
                                required
                            />
                        </label>

                        <label className="walk-in-field walk-in-narrow">
                            <span>Age</span>
                            <input
                                type="number"
                                value={form.age}
                                onChange={set("age")}
                                min={MIN_AGE}
                                max={25}
                                required
                            />
                        </label>

                        <label className="walk-in-field walk-in-narrow">
                            <span>Grade</span>
                            <select value={form.grade} onChange={set("grade")} required>
                                <option value="">—</option>
                                {GRADES.map((grade) => (
                                    <option key={grade} value={grade}>
                                        {grade}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </>
                )}

                <label className="walk-in-field">
                    <span>Time slot</span>
                    <select
                        value={chosenSlot}
                        onChange={(event) => setSlot(event.target.value)}
                        required
                    >
                        {TIME_SLOTS.filter(
                            (s) => !(student && s.adultsOnly),
                        ).map((s) => {
                            const key = formatSlot(s);
                            return (
                                <option key={key} value={key}>
                                    {s.time} — {s.period}
                                </option>
                            );
                        })}
                    </select>
                </label>
            </div>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" className="walk-in-submit" disabled={saving}>
                {saving ? "Adding…" : "Add walk-in"}
            </button>
        </form>
    );
}
