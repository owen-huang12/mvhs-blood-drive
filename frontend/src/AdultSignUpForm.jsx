import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BloodDriveOverview from "./BloodDriveOverview.jsx";
import CollapsibleSection from "./CollapsibleSection.jsx";
import TimeSlotChoices from "./TimeSlotChoices.jsx";
import { REQUIRED_CHOICES } from "./timeSlots.js";
import { signUpAdult } from "./api.js";
import { ApiError } from "./api.js";

/**
 * Sign-up form for teachers and community members.
 *
 * Everything the student form asks for that only applies to school students —
 * student ID, age, grade, and the under-18 parent consent step — is left out.
 * That leaves a name, an email, and the three time choices, so there is no
 * second screen to review: this form registers directly.
 */
export default function AdultSignUpForm({ participantType }) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [selectedSlots, setSelectedSlots] = useState([]);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [registered, setRegistered] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (selectedSlots.length !== REQUIRED_CHOICES) {
            setError(
                `Please select exactly ${REQUIRED_CHOICES} preferred time slots.`
            );
            return;
        }

        setError("");
        setSubmitting(true);

        const [first_choice, second_choice, third_choice] = selectedSlots;
        try {
            await signUpAdult({
                full_name: name,
                email_address: email,
                participant_type: participantType,
                first_choice,
                second_choice,
                third_choice,
            });
            setRegistered(true);
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.message
                    : "Something went wrong submitting your registration. Please try again."
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (registered) {
        return (
            <main className="page">
                <section>
                    <h1 className="section-title">You're registered</h1>
                    <div className="section-body">
                        <p className="form-prompt">
                            Thanks for signing up for the Stanford Blood Drive.
                            We'll send your assigned donation time slot to{" "}
                            <strong>{email}</strong> by 8/12 at 2:30 PM.
                        </p>
                        <button
                            type="button"
                            className="submit-btn"
                            onClick={() => navigate("/")}
                        >
                            Back to home
                        </button>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <main className="page">
            <BloodDriveOverview role={participantType} />

            <section className="form-section">
                <form className="signup-form" onSubmit={handleSubmit}>
                    <CollapsibleSection as="div" title="Contact information">
                        <p className="form-prompt">
                            Please fill out the form below with your information
                            to register for the blood drive. All fields are
                            required.
                        </p>

                        <div className="form-field">
                            <label htmlFor="name">
                                Full Name <span className="required">*</span>
                            </label>
                            <input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Please enter your full name"
                                required
                            />
                        </div>

                        <div className="form-field">
                            <label htmlFor="email">
                                Email (preferred email){" "}
                                <span className="required">*</span>
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection as="div" title="Preferred time slot">
                        <TimeSlotChoices
                            selected={selectedSlots}
                            onChange={setSelectedSlots}
                        />
                    </CollapsibleSection>

                    {error && <p className="login-error">{error}</p>}

                    <button
                        type="submit"
                        className="submit-btn"
                        disabled={submitting}
                    >
                        {submitting ? "Registering…" : "Register"}
                    </button>
                </form>
            </section>
        </main>
    );
}
