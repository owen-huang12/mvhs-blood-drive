import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AgreementFields from "./AgreementFields.jsx";
import BloodDriveOverview from "./BloodDriveOverview.jsx";
import CollapsibleSection from "./CollapsibleSection.jsx";
import EligibilityRequirements from "./EligibilityRequirements.jsx";
import HowHearField from "./HowHearField.jsx";
import TimeSlotChoices from "./TimeSlotChoices.jsx";
import { REQUIRED_CHOICES, SLOT_NOTICE_DEADLINE } from "./timeSlots.js";
import { signUpAdult } from "./api.js";
import { ApiError } from "./api.js";
import ContactNote from "./ContactNote.jsx";
import { useFullNameCheck } from "./fullName.js";

/**
 * Sign-up form for teachers and community members.
 *
 * Everything the student form asks for that only applies to school students —
 * student ID, age, grade, the 16-year-old parent consent step, and missing
 * class — is left out. The rest (how they heard, eligibility, the agreement)
 * fits on this one page, so there is no second screen: it registers directly.
 */
export default function AdultSignUpForm({ participantType }) {
    const [name, setName] = useState("");
    const [preferredName, setPreferredName] = useState("");
    const [email, setEmail] = useState("");
    const [selectedSlots, setSelectedSlots] = useState([]);
    const [howHear, setHowHear] = useState("");
    const [eligible, setEligible] = useState(false);
    const [signature, setSignature] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [registered, setRegistered] = useState(false);
    const navigate = useNavigate();
    const nameRef = useFullNameCheck(name);

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
                preferred_name: preferredName,
                email_address: email,
                participant_type: participantType,
                first_choice,
                second_choice,
                third_choice,
                how_hear: howHear,
                agreement_signature: signature,
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
                            <strong>{email}</strong> by {SLOT_NOTICE_DEADLINE}.
                        </p>
                        <ContactNote />
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
                            required except preferred name.
                        </p>

                        <div className="form-field">
                            <label htmlFor="name">
                                Full Legal Name <span className="required">*</span>
                            </label>
                            <input
                                ref={nameRef}
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Please enter your full legal name"
                                maxLength={50}
                                required
                            />
                        </div>

                        <div className="form-field">
                            <label htmlFor="preferredName">
                                Preferred Name <span className="optional">(optional)</span>
                            </label>
                            <input
                                id="preferredName"
                                value={preferredName}
                                onChange={(e) => setPreferredName(e.target.value)}
                                maxLength={50}
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
                                maxLength={100}
                                required
                            />
                        </div>

                        <HowHearField value={howHear} onChange={setHowHear} />
                    </CollapsibleSection>

                    <CollapsibleSection as="div" title="Preferred time slot">
                        <TimeSlotChoices
                            selected={selectedSlots}
                            onChange={setSelectedSlots}
                        />
                    </CollapsibleSection>

                    <CollapsibleSection as="div" title="Eligibility requirements">
                        <EligibilityRequirements
                            adult
                            eligible={eligible}
                            onEligibleChange={setEligible}
                        />
                    </CollapsibleSection>

                    <CollapsibleSection as="div" title="Agreement">
                        <AgreementFields
                            signature={signature}
                            onSignatureChange={setSignature}
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
