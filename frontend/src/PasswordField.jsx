import { useState } from "react";

const EyeIcon = (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M9.9 5.2A10.3 10.3 0 0 1 12 5c6.4 0 10 7 10 7a14 14 0 0 1-2.8 3.7" />
        <path d="M6.3 6.8A13.9 13.9 0 0 0 2 12s3.6 7 10 7a10.2 10.2 0 0 0 4.2-.9" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        <path d="m3 3 18 18" />
    </svg>
);

/**
 * Masked input with a shaded eye button that reveals what has been typed.
 *
 * Useful on every field here: invite codes and passwords are both easy to
 * fat-finger, and there is no way to spot the typo while it's dotted out.
 */
export default function PasswordField({ id, label, value, onChange, ...inputProps }) {
    const [revealed, setRevealed] = useState(false);

    return (
        <div className="form-field">
            <label htmlFor={id}>{label}</label>
            <div className="password-field">
                <input
                    id={id}
                    type={revealed ? "text" : "password"}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    required
                    {...inputProps}
                />
                <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setRevealed((shown) => !shown)}
                    aria-label={revealed ? "Hide" : "Show"}
                    aria-pressed={revealed}
                    title={revealed ? "Hide" : "Show"}
                >
                    {revealed ? EyeOffIcon : EyeIcon}
                </button>
            </div>
        </div>
    );
}
