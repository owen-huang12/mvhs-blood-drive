import { useState } from "react";
import { useNavigate } from "react-router-dom";
import icon from "./assets/icon.png";
import { saveToken } from "./auth.js";
import { login } from "./api.js";

export default function CoordinatorsPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

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
                    <div className="form-field">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                        />
                    </div>

                    {error && <p className="login-error">{error}</p>}

                    <div className="login-actions">
                        <button type="submit" className="submit-btn" disabled={loading}>
                            {loading ? "Signing in…" : "Sign In"}
                        </button>
                        <button type="button" className="forgot-password-btn">
                            Forgot password?
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
