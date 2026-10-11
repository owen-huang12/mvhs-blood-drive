import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import icon from "./assets/icon.png";
import PasswordField from "./PasswordField.jsx";
import { saveToken } from "./auth.js";
import { login } from "./api.js";

export default function CoordinatorsPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    // Set by endSession() when a signed-in page's token stops working.
    const expired = useSearchParams()[0].get("expired") === "1";

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const { access_token } = await login(email, password);
            saveToken(access_token);
            navigate("/coordinators/dashboard");
        } catch (err) {
            setError(
                err.status === 401
                    ? "Incorrect email or password."
                    : "Could not reach the server. Try again."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-brand">
                    <img
                        src={icon}
                        alt="MVHS Blood Drive"
                        className="login-icon"
                    />
                    <span className="login-brand-text">
                        Mountain View High School
                        <br />
                        Stanford Blood Drive
                    </span>
                </div>

                <h2 className="login-heading">Sign In</h2>
                {expired && (
                    <p className="form-prompt">
                        Your session expired. Sign in again to keep going.
                    </p>
                )}

                <form className="login-form" onSubmit={handleSubmit}>
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
                        <button
                            type="button"
                            className="forgot-password-btn"
                            onClick={() => navigate("/coordinators/forgot-password")}
                        >
                            Forgot password?
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
