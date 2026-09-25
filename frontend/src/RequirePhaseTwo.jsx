import { Navigate } from "react-router-dom";
import { isPhaseTwoOpen } from "./phase.js";

/**
 * Hide the day-of pages until the drive is close.
 *
 * Only removes them from view — the server refuses the writes on the same
 * date, so this is convenience rather than the boundary itself.
 */
export default function RequirePhaseTwo({ children }) {
    return isPhaseTwoOpen() ? children : <Navigate to="/" replace />;
}
