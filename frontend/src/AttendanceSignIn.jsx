import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuthCard from "./AuthCard.jsx";
import PasswordField from "./PasswordField.jsx";
import { saveToken } from "./auth.js";
import { login } from "./api.js";

/**
 * The attendance clerk's sign-in.
 *
 * Separate from the coordinators' page because she signs in with a username,
 * not an email, and because nothing here should offer her the coordinator
 * account flows — there is no mailbox behind this login to reset.
 */
export default function AttendanceSignIn() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    // Set by endSession() when the token on an open page stops working.
    const expired = useSearchParams()[0].get("expired") === "1";

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const { access_token } = await login(username, password);
            saveToken(access_token);
            navigate("/coordinators/attendance");
        } catch (err) {
            setError(
                err.status === 401
                    ? "Incorrect username or password."
                    : "Could not reach the server. Try again.",
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <AuthCard
            heading="Attendance Sign In"
            prompt={
                expired
                    ? "Your session expired. Sign in again to keep going."
                    : undefined
            }
        >
            <form className="login-form" onSubmit={handleSubmit}>
                <div className="form-field">
                    <label htmlFor="username">Username</label>
                    <input
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        autoComplete="username"
                        required
                    />
                </div>
                <PasswordField
                    id="password"
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                />

                {error && <p className="login-error">{error}</p>}

                <div className="login-actions">
                    <button type="submit" className="submit-btn" disabled={loading}>
                        {loading ? "Signing in…" : "Sign In"}
                    </button>
                </div>
            </form>
        </AuthCard>
    );
}
