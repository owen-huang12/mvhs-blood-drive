import { NavLink } from "react-router-dom";

/**
 * The coordinator pages, as the title bar.
 *
 * Replaces the plain heading each page carried: they are three views of one
 * drive, and a coordinator moves between them constantly — typing URLs for
 * pages with no links was the only way across.
 *
 * The attendance worklist is deliberately absent. It is the clerk's page,
 * reached from her own sign-in, and listing it here would invite a
 * coordinator into a view whose one control belongs to someone else.
 */
const TABS = [
    { to: "/coordinators/dashboard", label: "Coordinator Dashboard" },
    { to: "/coordinators/day-of", label: "Check-In Station" },
    { to: "/coordinators/emailing", label: "Emailing" },
];

export default function DashboardTabs() {
    return (
        <nav className="dashboard-tabs" aria-label="Coordinator pages">
            {TABS.map(({ to, label }) => (
                <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                        `dashboard-tab${isActive ? " is-active" : ""}`
                    }
                >
                    {label}
                </NavLink>
            ))}
        </nav>
    );
}
