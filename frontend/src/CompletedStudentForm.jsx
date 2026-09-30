import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, signUpStudent } from "./api.js";
import EligibilityRequirements from "./EligibilityRequirements.jsx";
import ConsentFormLinks from "./ConsentFormLinks.jsx";
import ContactNote from "./ContactNote.jsx";
import { CONTACT_EMAIL } from "./contact.js";
import { useFullNameCheck } from "./fullName.js";
import { SLOT_NOTICE_DEADLINE } from "./timeSlots.js";

/**
 * Donors under this age have to bring a signed parent consent form.
 * Mirrored by CONSENT_REQUIRED_UNDER_AGE in backend/main.py.
 */
const CONSENT_REQUIRED_UNDER = 17;

/** "How did you hear about the drive?" Mirrored by HOW_HEAR_OPTIONS in backend/main.py. */
const HOW_HEAR_OPTIONS = [
    "Friends and family",
    "Mountain View advertisement",
    "Teacher or class announcement",
    "School email or newsletter",
    "Social media",
    "Other",
];

/**
 * What an under-age donor has to do with the consent form, and the links to it.
 *
 * Shown before and after confirming: Stanford Blood Center turns a minor away
 * without a correctly signed paper copy, so this can't be a one-time mention.
 */
function ConsentFormNotice() {
    return (
        <>
            <p className="form-prompt">
                You'll need to bring a signed parent consent form to your
                appointment. Print the form, have your parent or legal guardian
                fill out Section 1, and fill out Section 2 yourself. Both
                signatures must be in blue or black ballpoint pen.{" "}
                <strong>You won't be allowed to donate without it.</strong>
            </p>
            <ConsentFormLinks />
        </>
    );
}

/**
 * Final step of the student sign-up: review, agree, confirm.
 *
 * The form page navigates here without saving anything — the POST happens on
 * Confirm below, so a 16-year-old donor has acknowledged the parent consent form
 * before a record exists.
 */
export default function CompletedStudentForm() {
    const signUp = useLocation().state?.signUp;
    const navigate = useNavigate();

    const [agreed, setAgreed] = useState(false);
    const [eligible, setEligible] = useState(false);
    const [howHear, setHowHear] = useState(signUp?.how_hear ?? "");
    const [signature, setSignature] = useState(signUp?.agreement_signature ?? "");
    const signatureRef = useFullNameCheck(signature);
    const [registered, setRegistered] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    // Reached without going through the form (direct URL, cleared history):
    // there is nothing to confirm, so send them back to sign up.
    if (!signUp) {
        return <Navigate to="/signup/student" replace />;
    }

    const needsConsentForm = signUp.age < CONSENT_REQUIRED_UNDER;
    const answers = { how_hear: howHear, agreement_signature: signature };

    async function handleConfirm(e) {
        e.preventDefault();
        setError("");
        setSubmitting(true);
        try {
            await signUpStudent({ ...signUp, ...answers });
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
    }

    if (registered) {
        return (
            <main className="page">
                <section>
                    <h1 className="section-title">You're registered</h1>
                    <div className="section-body">
                        <p className="form-prompt">
                            Thanks for signing up for the Stanford Blood Drive.
                            We'll send your assigned donation time slot to{" "}
                            <strong>{signUp.email_address}</strong> by {SLOT_NOTICE_DEADLINE}.
                        </p>
                        {needsConsentForm && <ConsentFormNotice />}
                        <ContactNote />
                        <Link to="/" className="submit-btn">
                            Back to home
                        </Link>
                    </div>
                </section>
            </main>
        );
    }

    // One form across the three sections, so the browser's own required-field
    // checks cover the dropdown, the signature and the consent checkbox.
    return (
        <main className="page">
            <form onSubmit={handleConfirm}>
                <section>
                    <h1 className="section-title">Confirm your registration</h1>
                    <div className="section-body">
                        <p className="form-prompt">
                            Once you confirm, we'll send your assigned donation
                            time slot to <strong>{signUp.email_address}</strong>{" "}
                            by {SLOT_NOTICE_DEADLINE}.
                        </p>

                        <div className="form-field">
                            <label htmlFor="howHear">
                                How did you hear about the blood drive?{" "}
                                <span className="required">*</span>
                            </label>
                            <select
                                id="howHear"
                                value={howHear}
                                onChange={(e) => setHowHear(e.target.value)}
                                required
                            >
                                <option value="" disabled>
                                    Choose one
                                </option>
                                {HOW_HEAR_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                <section className="form-section">
                    <h2 className="section-title">Eligibility requirements</h2>
                    <div className="section-body">
                        <EligibilityRequirements />

                        <label className="consent-check eligibility-check">
                            <input
                                type="checkbox"
                                checked={eligible}
                                onChange={(e) => setEligible(e.target.checked)}
                                required
                            />
                            I am eligible for the blood drive.
                        </label>
                    </div>
                </section>

                {needsConsentForm && (
                    <section className="form-section">
                        <h2 className="section-title">Consent form</h2>
                        <div className="section-body">
                            <div className="consent-block">
                                <ConsentFormNotice />

                                <label className="consent-check">
                                    <input
                                        type="checkbox"
                                        checked={agreed}
                                        onChange={(e) => setAgreed(e.target.checked)}
                                        required
                                    />
                                    I understand that I must bring the consent
                                    form, signed by my parent or guardian and by
                                    me, to my appointment, and that I will not be
                                    allowed to donate without it.
                                </label>
                            </div>
                        </div>
                    </section>
                )}

                <section className="form-section">
                    <h2 className="section-title">Agreement</h2>
                    <div className="section-body">
                        <p className="form-prompt">
                            You are responsible for telling your teacher that
                            you'll be out of class for your donation
                            appointment.{" "}
                            <strong>
                                Your appointment confirmation email is your
                                official permission slip to be excused from
                                class.
                            </strong>
                        </p>
                        <p className="form-prompt agreement-intro">
                            By signing your name, you agree to:
                        </p>
                        <ul className="eligibility-list">
                            <li>Arrive at your appointment on time.</li>
                            <li>
                                Tell us if you can't make your appointment or
                                need to reschedule, by emailing{" "}
                                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                            </li>
                        </ul>
                        <div className="form-field">
                            <label htmlFor="signature">
                                Sign your first and last name{" "}
                                <span className="required">*</span>
                            </label>
                            <input
                                ref={signatureRef}
                                id="signature"
                                value={signature}
                                onChange={(e) => setSignature(e.target.value)}
                                maxLength={50}
                                autoComplete="off"
                                required
                            />
                        </div>

                        {error && <p className="login-error">{error}</p>}

                        <div className="confirm-actions">
                            <button
                                type="submit"
                                className="submit-btn"
                                disabled={submitting}
                            >
                                {submitting ? "Confirming…" : "Confirm"}
                            </button>
                            <button
                                type="button"
                                className="login-link-btn"
                                onClick={() =>
                                    navigate("/signup/student", {
                                        state: { signUp: { ...signUp, ...answers } },
                                    })
                                }
                            >
                                Go back and edit
                            </button>
                        </div>
                    </div>
                </section>
            </form>
        </main>
    );
}
