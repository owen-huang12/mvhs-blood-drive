import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuthCard from "./AuthCard.jsx";
import PasswordField from "./PasswordField.jsx";
import { resetPassword } from "./api.js";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Step two of a password reset, reached from the link in the email.
 *
 * The token rides in the query string. The server decides whether it is still
 * good, so an expired link only fails once a new password is submitted.
 */
export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token") ?? "";

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSubmit(e) {
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
            await resetPassword(token, password);
            setDone(true);
        } catch (err) {
            setError(err.message || "Could not reach the server. Try again.");
        } finally {
            setLoading(false);
        }
    }

    if (!token) {
        return (
            <AuthCard
                heading="Reset Password"
                prompt="This reset link is missing its code. Open the link from your email again, or request a new one."
            >
                <div className="login-actions">
                    <button
                        type="button"
                        className="submit-btn"
                        onClick={() => navigate("/coordinators/forgot-password")}
                    >
                        Request New Link
                    </button>
                </div>
            </AuthCard>
        );
    }

    if (done) {
        return (
            <AuthCard
                heading="Password Reset"
                prompt="Your password has been updated. Sign in with your new password."
            >
                <div className="login-actions">
                    <button
                        type="button"
                        className="submit-btn"
                        onClick={() => navigate("/coordinators", { replace: true })}
                    >
                        Sign In
                    </button>
                </div>
            </AuthCard>
        );
    }

    return (
        <AuthCard heading="Reset Password" prompt="Choose a new password for your account.">
            <form className="login-form" onSubmit={handleSubmit}>
                <PasswordField
                    id="password"
                    label="New Password"
                    value={password}
                    onChange={setPassword}
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                />
                <PasswordField
                    id="confirmPassword"
                    label="Confirm Password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                />

                {error && <p className="login-error">{error}</p>}

                <div className="login-actions">
                    <button type="submit" className="submit-btn" disabled={loading}>
                        {loading ? "Saving…" : "Reset Password"}
                    </button>
                    <button
                        type="button"
                        className="login-link-btn"
                        onClick={() => navigate("/coordinators/forgot-password")}
                    >
                        Request new link
                    </button>
                </div>
            </form>
        </AuthCard>
    );
}
