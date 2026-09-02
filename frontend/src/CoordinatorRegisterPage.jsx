import { useState } from "react";
import { useNavigate } from "react-router-dom";
import icon from "./assets/icon.png";
import { saveToken } from "./auth.js";
import { createCoordinator, login, verifyInviteCode } from "./api.js";

const MIN_PASSWORD_LENGTH = 8;

/** Shared frame so both steps sit in the same card as the sign-in page. */
function RegisterCard({ heading, prompt, children }) {
    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-brand">
                    <img src={icon} alt="MVHS Blood Drive" className="login-icon" />
                    <span className="login-brand-text">
                        Mountain View High School
                        <br />
                        Stanford Blood Drive
                    </span>
                </div>

                <h2 className="login-heading">{heading}</h2>
                <p className="form-prompt">{prompt}</p>

                {children}
            </div>
        </div>
    );
}

/**
 * Invite-only coordinator registration.
 *
 * Step one takes the admin code, step two the account details. The code is
 * checked on its own first only so a wrong code fails before someone fills out
 * the whole form — it is sent again with the account and re-checked there,
 * since this gate is just UI and proves nothing to the server.
 */
export default function CoordinatorRegisterPage() {
    const [inviteCode, setInviteCode] = useState("");
    const [codeAccepted, setCodeAccepted] = useState(false);

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleCodeSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await verifyInviteCode(inviteCode);
            setCodeAccepted(true);
        } catch (err) {
            setError(
                err.status === 401
                    ? "That admin code isn't right."
                    : err.message || "Could not reach the server. Try again."
            );
        } finally {
            setLoading(false);
        }
    }

    async function handleRegisterSubmit(e) {
        e.preventDefault();

        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }
        if (password !== confirmPassword) {
            setError("Those passwords don't match.");
            return;
        }

        setError("");
        setLoading(true);

        try {
            await createCoordinator({ fullName, email, password, inviteCode });
            // Straight into the dashboard — they just typed these credentials,
            // so there is nothing to gain by sending them to the sign-in page.
            const { access_token } = await login(email, password);
            saveToken(access_token);
            navigate("/coordinators/dashboard", { replace: true });
        } catch (err) {
            // A stale code sends them back to step one; everything else is a
            // problem with the form they can fix in place.
            if (err.status === 401) setCodeAccepted(false);
            setError(err.message || "Could not reach the server. Try again.");
        } finally {
            setLoading(false);
        }
    }

    if (!codeAccepted) {
        return (
            <RegisterCard
                heading="Coordinator Sign Up"
                prompt="Enter the admin code you were sent to set up your account."
            >
                <form className="login-form" onSubmit={handleCodeSubmit}>
                    <div className="form-field">
                        <label htmlFor="inviteCode">Admin Code</label>
                        <input
                            id="inviteCode"
                            type="password"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value)}
                            placeholder="Enter your admin code"
                            autoComplete="off"
                            required
                        />
                    </div>

                    {error && <p className="login-error">{error}</p>}

                    <div className="login-actions">
                        <button type="submit" className="submit-btn" disabled={loading}>
                            {loading ? "Checking…" : "Continue"}
                        </button>
                    </div>
                </form>
            </RegisterCard>
        );
    }

    return (
        <RegisterCard
            heading="Create Account"
            prompt="Your admin code checked out. Fill in your details to finish."
        >
            <form className="login-form" onSubmit={handleRegisterSubmit}>
                <div className="form-field">
                    <label htmlFor="fullName">Full Name</label>
                    <input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Enter your full name"
                        required
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        required
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
                        required
                    />
                </div>

                {error && <p className="login-error">{error}</p>}

                <div className="login-actions">
                    <button type="submit" className="submit-btn" disabled={loading}>
                        {loading ? "Creating account…" : "Create Account"}
                    </button>
                    <button
                        type="button"
                        className="login-link-btn"
                        onClick={() => navigate("/coordinators")}
                    >
                        Back to sign in
                    </button>
                </div>
            </form>
        </RegisterCard>
    );
}
