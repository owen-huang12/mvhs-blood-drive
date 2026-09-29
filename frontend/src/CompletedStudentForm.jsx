import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, signUpStudent } from "./api.js";

/**
 * Donors under this age have to bring a signed parent consent form.
 * Mirrored by CONSENT_REQUIRED_UNDER_AGE in backend/main.py.
 */
const CONSENT_REQUIRED_UNDER = 18;

// Stanford Blood Center's form, served from frontend/public/.
const CONSENT_FORMS = [
    { label: "Consent form (English)", href: "/05-FX1-Consent-for-Minor-to-Donate-Blood-Eng.pdf" },
    { label: "Formulario de consentimiento (Español)", href: "/05-FX1S-Consent-for-Minor-to-Donate-Blood-Sp.pdf" },
];

/** Box with an arrow out of it: the PDF opens in a new tab. */
const ExternalLinkIcon = (
    <svg
        className="external-link-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M14 4h6v6" />
        <path d="M20 4 10 14" />
        <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
);

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
            <div className="consent-form-links">
                {CONSENT_FORMS.map(({ label, href }) => (
                    <a
                        key={href}
                        className="consent-form-link"
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {label}
                        {ExternalLinkIcon}
                    </a>
                ))}
            </div>
        </>
    );
}

/**
 * Final step of the student sign-up: review, agree, confirm.
 *
 * The form page navigates here without saving anything — the POST happens on
 * Confirm below, so an under-18 donor has acknowledged the parent consent form
 * before a record exists.
 */
export default function CompletedStudentForm() {
    const signUp = useLocation().state?.signUp;
    const navigate = useNavigate();

    const [agreed, setAgreed] = useState(false);
    const [registered, setRegistered] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    // Reached without going through the form (direct URL, cleared history):
    // there is nothing to confirm, so send them back to sign up.
    if (!signUp) {
        return <Navigate to="/signup/student" replace />;
    }

    const needsConsentForm = signUp.age < CONSENT_REQUIRED_UNDER;
    const canConfirm = !submitting && (!needsConsentForm || agreed);

    async function handleConfirm() {
        setError("");
        setSubmitting(true);
        try {
            await signUpStudent(signUp);
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
                            <strong>{signUp.email_address}</strong> by 8/12 at
                            2:30 PM.
                        </p>
                        {needsConsentForm && <ConsentFormNotice />}
                        <Link to="/" className="submit-btn">
                            Back to home
                        </Link>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <main className="page">
            <section>
                <h1 className="section-title">Confirm your registration</h1>
                <div className="section-body">
                    <p className="form-prompt">
                        Once you confirm, we'll send your assigned donation time
                        slot to <strong>{signUp.email_address}</strong> by 8/12
                        at 2:30 PM.
                    </p>

                    {needsConsentForm && (
                        <div className="consent-block">
                            <ConsentFormNotice />

                            <label className="consent-check">
                                <input
                                    type="checkbox"
                                    checked={agreed}
                                    onChange={(e) => setAgreed(e.target.checked)}
                                />
                                I understand that I must bring the consent form,
                                signed by my parent or guardian and by me, to my
                                appointment, and that I will not be allowed to
                                donate without it.
                            </label>
                        </div>
                    )}

                    {error && <p className="login-error">{error}</p>}

                    <div className="confirm-actions">
                        <button
                            type="button"
                            className="submit-btn"
                            onClick={handleConfirm}
                            disabled={!canConfirm}
                            title={
                                needsConsentForm && !agreed
                                    ? "Please agree to the parent consent form first"
                                    : undefined
                            }
                        >
                            {submitting ? "Confirming…" : "Confirm"}
                        </button>
                        <button
                            type="button"
                            className="login-link-btn"
                            onClick={() =>
                                navigate("/signup/student", { state: { signUp } })
                            }
                        >
                            Go back and edit
                        </button>
                    </div>
                </div>
            </section>
        </main>
    );
}
