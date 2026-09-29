import icon from "./assets/icon.png";

/** Shared frame for the coordinator account pages, matching the sign-in card. */
export default function AuthCard({ heading, prompt, children }) {
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
                {prompt && <p className="form-prompt">{prompt}</p>}

                {children}
            </div>
        </div>
    );
}
