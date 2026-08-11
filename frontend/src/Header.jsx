import { Link } from "react-router-dom";
import icon from "./assets/icon.png";

/**
 * Site header. Pass `to` to make the brand a link home; `children` renders
 * ahead of the brand (the dashboard uses it for the profile pill).
 */
export default function Header({ to, children }) {
    const Brand = to ? Link : "div";

    return (
        <header className="header">
            {children}
            <Brand {...(to ? { to } : {})} className="header-brand">
                <img src={icon} alt="MVHS Blood Drive" className="header-icon" />
                <span className="header-title">
                    MVHS<br />Stanford Blood Drive
                </span>
            </Brand>
        </header>
    );
}
