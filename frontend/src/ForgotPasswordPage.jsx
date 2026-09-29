import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthCard from "./AuthCard.jsx";
import { requestPasswordReset } from "./api.js";

/**
 * Step one of a password reset: ask for the account email.
 *
 * The server answers the same way whether or not the account exists, so the
 * confirmation here is worded as "if" — it can't say more than the server does.
 */
export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await requestPasswordReset(email);
            setSent(true);
        } catch (err) {
            setError(err.message || "Could not reach the server. Try again.");
        } finally {
            setLoading(false);
        }
    }

    const backToSignIn = (
        <button
            type="button"
            className="login-link-btn"
            onClick={() => navigate("/coordinators")}
        >
            Back to sign in
        </button>
    );

    if (sent) {
        return (
            <AuthCard
                heading="Check Your Email"
                prompt={`If an account exists for ${email.trim()}, we've sent a link to reset your password. It expires in 30 minutes.`}
            >
                <div className="login-actions">{backToSignIn}</div>
            </AuthCard>
        );
    }

    return (
        <AuthCard
            heading="Forgot Password"
            prompt="Enter your account email and we'll send you a link to set a new password."
        >
            <form className="login-form" onSubmit={handleSubmit}>
                <div className="form-field">
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        autoComplete="email"
                        required
                    />
                </div>

                {error && <p className="login-error">{error}</p>}

                <div className="login-actions">
                    <button type="submit" className="submit-btn" disabled={loading}>
                        {loading ? "Sending…" : "Send Reset Link"}
                    </button>
                    {backToSignIn}
                </div>
            </form>
        </AuthCard>
    );
}
