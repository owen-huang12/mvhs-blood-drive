import { Navigate, useLocation } from "react-router-dom";
import { isClerk, isTokenValid } from "./auth.js";

/**
 * Coordinator-only pages.
 *
 * Signing in sends them on to the page they asked for, not to the dashboard:
 * these URLs are handed out directly, so arriving at one signed out is the
 * normal way in rather than a mistake.
 *
 * The attendance clerk is turned away even though her token is valid: it is
 * refused by every coordinator endpoint, so letting her in would only show
 * her a page that fails on every request. The API enforces the same split.
 */
export default function RequireAuth({ children }) {
    const location = useLocation();

    if (!isTokenValid()) {
        return (
            <Navigate
                to="/coordinators"
                replace
                state={{ from: location.pathname + location.search }}
            />
        );
    }
    if (isClerk()) return <Navigate to="/coordinators/attendance" replace />;
    return children;
}
