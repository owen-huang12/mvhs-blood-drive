import { Navigate } from "react-router-dom";
import { isTokenValid } from "./auth.js";

export default function RequireAuth({ children }) {
    return isTokenValid() ? children : <Navigate to="/coordinators" replace />;
}
