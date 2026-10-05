import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BloodDriveOverview from "./BloodDriveOverview.jsx";
import CollapsibleSection from "./CollapsibleSection.jsx";
import TimeSlotChoices from "./TimeSlotChoices.jsx";
import ChoiceClassFields from "./ChoiceClassFields.jsx";
import { useFullNameCheck } from "./fullName.js";
import { REQUIRED_CHOICES } from "./timeSlots.js";

const GRADES = ["9th", "10th", "11th", "12th"];
const MIN_AGE = 16;

/** Labelled text input — the shape every field on this form takes. */
function Field({ id, label, value, onChange, optional = false, inputRef, ...inputProps }) {
    return (
        <div className="form-field">
            <label htmlFor={id}>
                {label}{" "}
                {optional ? (
                    <span className="optional">(optional)</span>
                ) : (
                    <span className="required">*</span>
                )}
            </label>
            <input
                ref={inputRef}
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required={!optional}
                {...inputProps}
            />
        </div>
    );
}

export default function StudentPersonalInfo() {
    // Sent back by the confirm screen when the sign-up was rejected there (a
    // duplicate email, say), so a fixable mistake doesn't cost the whole form.
    const prior = useLocation().state?.signUp;

    const [name, setName] = useState(prior?.full_name ?? "");
    const [preferredName, setPreferredName] = useState(prior?.preferred_name ?? "");
    const [studentId, setStudentId] = useState(prior?.student_id ?? "");
    const [age, setAge] = useState(prior?.age != null ? String(prior.age) : "");
    const [email, setEmail] = useState(prior?.email_address ?? "");
    const [grade, setGrade] = useState(prior?.grade ?? "");
    const [selectedSlots, setSelectedSlots] = useState(() =>
        [prior?.first_choice, prior?.second_choice, prior?.third_choice].filter(
            Boolean
        )
    );
    // Keyed by slot, rebuilt from the ordered list "Go back and edit" sends.
    const [classes, setClasses] = useState(() =>
        Object.fromEntries(
            [prior?.first_choice, prior?.second_choice, prior?.third_choice]
                .map((slot, i) => [slot, prior?.choice_classes?.[i]])
                .filter(([slot, value]) => slot && value)
        )
    );
    const [error, setError] = useState("");
    const navigate = useNavigate();
    const nameRef = useFullNameCheck(name);

    const handleSubmit = (event) => {
        event.preventDefault();

        if (selectedSlots.length !== REQUIRED_CHOICES) {
            setError(`Please select exactly ${REQUIRED_CHOICES} preferred time slots.`);
            return;
        }

        if (Number(age) < MIN_AGE) {
            setError(`You must be at least ${MIN_AGE} years old to sign up.`);
            return;
        }

        setError("");

        // Already stored as "<period> - <time>" by formatSlot.
        const [first_choice, second_choice, third_choice] = selectedSlots;

        // Nothing is saved yet — the confirm screen posts this once they have
        // confirmed, and (if 16) acknowledged the parent consent form.
        navigate("/completed", {
            state: {
                signUp: {
                    full_name: name,
                    preferred_name: preferredName,
                    student_id: studentId,
                    age: Number(age),
                    email_address: email,
                    grade,
                    first_choice,
                    second_choice,
                    third_choice,
                    // The class missed at each choice, in the same order.
                    choice_classes: selectedSlots.map(
                        (slot) => classes[slot] ?? { teacher: "", room: "" }
                    ),
                    // Answered on the confirm screen; carried through so
                    // "Go back and edit" doesn't wipe them.
                    how_hear: prior?.how_hear,
                    agreement_signature: prior?.agreement_signature,
                },
            },
        });
    };

    return (
        <main className="page">
            <BloodDriveOverview />

            <section className="form-section">
                <form className="signup-form" onSubmit={handleSubmit}>
                    <CollapsibleSection as="div" title="Personal & Contact information">
                        <p className="form-prompt">
                            Please fill out the form below with your information
                            to register for the blood drive. All fields are
                            required except preferred name.
                        </p>

                        <Field
                            id="name"
                            label="Full Legal Name"
                            inputRef={nameRef}
                            value={name}
                            onChange={setName}
                            placeholder="Please enter your full legal name"
                            maxLength={50}
                        />
                        <Field
                            id="preferredName"
                            label="Preferred Name"
                            value={preferredName}
                            onChange={setPreferredName}
                            maxLength={50}
                            optional
                        />
                        <Field
                            id="studentId"
                            label="Student ID"
                            value={studentId}
                            onChange={setStudentId}
                            maxLength={10}
                        />
                        <Field
                            id="age"
                            label="Age"
                            type="number"
                            min={MIN_AGE}
                            max={25}
                            value={age}
                            onChange={setAge}
                        />
                        <Field
                            id="email"
                            label="Email (preferred email)"
                            type="email"
                            value={email}
                            onChange={setEmail}
                            maxLength={100}
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
                                            required
                                        />
                                        {g}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection as="div" title="Preferred time slot">
                        <TimeSlotChoices
                            selected={selectedSlots}
                            onChange={setSelectedSlots}
                        />
                        <ChoiceClassFields
                            selected={selectedSlots}
                            classes={classes}
                            onChange={setClasses}
                        />
                    </CollapsibleSection>

                    {error && <p className="login-error">{error}</p>}

                    <button type="submit" className="submit-btn">
                        Review &amp; Register
                    </button>
                </form>
            </section>
        </main>
    );
}
