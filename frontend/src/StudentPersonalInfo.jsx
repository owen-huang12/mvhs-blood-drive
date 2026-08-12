import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CollapsibleSection from "./CollapsibleSection.jsx";
import { signUpStudent } from "./api.js";
import {
    CHOICE_LABELS,
    REQUIRED_CHOICES,
    TIME_SLOTS,
    colorsForPeriod,
    formatSlot,
} from "./timeSlots.js";

const GRADES = ["9th", "10th", "11th", "12th"];

/** Labelled required text input — the shape every field on this form takes. */
function Field({ id, label, value, onChange, ...inputProps }) {
    return (
        <div className="form-field">
            <label htmlFor={id}>
                {label} <span className="required">*</span>
            </label>
            <input
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required
                {...inputProps}
            />
        </div>
    );
}

export default function StudentPersonalInfo() {
    const [name, setName] = useState("");
    const [studentId, setStudentId] = useState("");
    const [age, setAge] = useState("");
    const [email, setEmail] = useState("");
    const [grade, setGrade] = useState("");
    const [selectedSlots, setSelectedSlots] = useState([]);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const navigate = useNavigate();

    const toggleTimeSlot = (slotKey) => {
        setSelectedSlots((prev) => {
            if (prev.includes(slotKey)) return prev.filter((k) => k !== slotKey);
            return prev.length >= REQUIRED_CHOICES ? prev : [...prev, slotKey];
        });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (selectedSlots.length !== REQUIRED_CHOICES) {
            setError(`Please select exactly ${REQUIRED_CHOICES} preferred time slots.`);
            return;
        }

        setError("");
        setSubmitting(true);

        // Already stored as "<period> - <time>" by formatSlot.
        const [first_choice, second_choice, third_choice] = selectedSlots;

        try {
            await signUpStudent({
                full_name: name,
                student_id: studentId,
                age: Number(age),
                email_address: email,
                grade,
                first_choice,
                second_choice,
                third_choice,
            });
            navigate("/completed", { replace: true, state: { email } });
        } catch {
            setError("Something went wrong submitting your registration. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="page">
            <CollapsibleSection title="Overview of the Stanford Blood Drive">
                <div className="overview-text">
                    <p>
                        Lorem ipsum dolor sit amet consectetur adipiscing elit.
                        Quisque faucibus ex sapien vitae pellentesque sem
                        placerat. In id cursus mi pretium tellus duis convallis.
                        Tempus leo eu aenean sed diam urna tempor. Pulvinar
                        vivamus fringilla lacus nec metus bibendum egestas.
                        Iaculis massa nisl malesuada lacinia integer nunc
                        posuere.
                    </p>
                    <p>
                        Lorem ipsum dolor sit amet consectetur adipiscing elit.
                        Quisque faucibus ex sapien vitae pellentesque sem
                        placerat. In id cursus mi pretium tellus duis convallis.
                        Tempus leo eu aenean sed diam urna tempor.
                    </p>
                </div>
            </CollapsibleSection>

            <section className="form-section">
                <form className="signup-form" onSubmit={handleSubmit}>
                    <CollapsibleSection as="div" title="Personal & Contact information">
                        <p className="form-prompt">
                            Please fill out the form below with your information
                            to register for the blood drive. All fields are
                            required.
                        </p>

                        <Field
                            id="name"
                            label="Full Name"
                            value={name}
                            onChange={setName}
                            placeholder="Please enter your full name"
                        />
                        <Field
                            id="studentId"
                            label="Student ID"
                            value={studentId}
                            onChange={setStudentId}
                        />
                        <Field
                            id="age"
                            label="Age"
                            type="number"
                            min="1"
                            value={age}
                            onChange={setAge}
                        />
                        <Field
                            id="email"
                            label="Email (preferred email)"
                            type="email"
                            value={email}
                            onChange={setEmail}
                        />

                        <div className="form-field">
                            <span className="form-field-label">
                                Grade <span className="required">*</span>
                            </span>
                            <div className="grade-options">
                                {GRADES.map((g) => (
                                    <label key={g} className="grade-radio">
                                        <input
                                            type="radio"
                                            name="grade"
                                            value={g}
                                            checked={grade === g}
                                            onChange={(e) => setGrade(e.target.value)}
                                        />
                                        {g}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection as="div" title="Preferred time slot">
                        <p className="form-prompt">
                            Please select exactly {REQUIRED_CHOICES} of your
                            preferred time slots, in order of preference. The
                            order you click them in sets your 1st, 2nd, and 3rd
                            choice.
                        </p>

                        <table className="timeslot-table">
                            <thead>
                                <tr>
                                    <th>Period</th>
                                    <th>Time slot</th>
                                    <th className="timeslot-choice-col">Your choice</th>
                                </tr>
                            </thead>
                            <tbody>
                                {TIME_SLOTS.map((slot) => {
                                    const slotKey = formatSlot(slot);
                                    const rank = selectedSlots.indexOf(slotKey);
                                    const isSelected = rank !== -1;
                                    const colors = colorsForPeriod(slot.period);
                                    const select = () => toggleTimeSlot(slotKey);

                                    return (
                                        <tr
                                            key={slotKey}
                                            className={`timeslot-row${isSelected ? " selected" : ""}`}
                                            role="button"
                                            aria-pressed={isSelected}
                                            tabIndex={0}
                                            onClick={select}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    select();
                                                }
                                            }}
                                        >
                                            <td>
                                                <span
                                                    className="timeslot-period"
                                                    style={{
                                                        backgroundColor: colors.bg,
                                                        color: colors.text,
                                                    }}
                                                >
                                                    {slot.period}
                                                </span>
                                            </td>
                                            <td className="timeslot-time">{slot.time}</td>
                                            <td className="timeslot-choice-col">
                                                {isSelected && (
                                                    <span className="timeslot-rank">
                                                        {CHOICE_LABELS[rank]}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </CollapsibleSection>

                    {error && <p className="login-error">{error}</p>}

                    <button type="submit" className="submit-btn" disabled={submitting}>
                        {submitting ? "Registering…" : "Register"}
                    </button>
                </form>
            </section>
        </main>
    );
}
