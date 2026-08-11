import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";

import "./index.css";
import Header from "./Header.jsx";
import HomePage from "./HomePage.jsx";
import StudentPersonalInfo from "./StudentPersonalInfo.jsx";
import CompletedStudentForm from "./CompletedStudentForm.jsx";
import CoordinatorsPage from "./CoordinatorsPage.jsx";
import CoordinatorDashboard from "./CoordinatorDashboard.jsx";
import RequireAuth from "./RequireAuth.jsx";

/** Public pages share the site header; coordinator pages render their own. */
function PublicLayout() {
    return (
        <>
            <Header to="/" />
            <Outlet />
        </>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/coordinators" element={<CoordinatorsPage />} />
                <Route
                    path="/coordinators/dashboard"
                    element={
                        <RequireAuth>
                            <CoordinatorDashboard />
                        </RequireAuth>
                    }
                />
                <Route element={<PublicLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/signup" element={<StudentPersonalInfo />} />
                    <Route path="/completed" element={<CompletedStudentForm />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
