import { Navigate } from "react-router-dom";
import { isTokenValid } from "./auth.js";

/**
 * Guard for the attendance worklist.
 *
 * Unlike RequireAuth this sends anyone signed out to the clerk's own sign-in,
 * so arriving at the page cold asks for her username rather than a
 * coordinator email she doesn't have. Coordinators are let through too: the
 * page is part of their dashboard, and the API allows both.
 */
export default function RequireAttendanceAuth({ children }) {
    return isTokenValid() ? (
        children
    ) : (
        <Navigate to="/coordinators/attendance/sign-in" replace />
    );
}
