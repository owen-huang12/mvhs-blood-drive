import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation } from "react-router-dom";

import "./index.css";
import Header from "./Header.jsx";
import HomePage from "./HomePage.jsx";
import StudentPersonalInfo from "./StudentPersonalInfo.jsx";
import CompletedStudentForm from "./CompletedStudentForm.jsx";
import TeacherSignUp from "./TeacherSignUp.jsx";
import CommunityMemberSignUp from "./CommunityMemberSignUp.jsx";
import CoordinatorsPage from "./CoordinatorsPage.jsx";
import CoordinatorRegisterPage from "./CoordinatorRegisterPage.jsx";
import ForgotPasswordPage from "./ForgotPasswordPage.jsx";
import ResetPasswordPage from "./ResetPasswordPage.jsx";
import CoordinatorDashboard from "./CoordinatorDashboard.jsx";
import RequireAuth from "./RequireAuth.jsx";
import RequirePhaseTwo from "./RequirePhaseTwo.jsx";
import DayOfStation from "./DayOfStation.jsx";
import AttendanceClerk from "./AttendanceClerk.jsx";
import AttendanceSignIn from "./AttendanceSignIn.jsx";
import RequireAttendanceAuth from "./RequireAttendanceAuth.jsx";
import { useScrollToTop } from "./scrollToTop.js";

/**
 * Public pages share the site header; coordinator pages render their own.
 * Each new page opens at the top.
 */
function PublicLayout() {
    useScrollToTop(useLocation().pathname);
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
                {/* Unlinked on purpose — the URL goes out to invitees only. */}
                <Route
                    path="/coordinators/register"
                    element={<CoordinatorRegisterPage />}
                />
                <Route
                    path="/coordinators/forgot-password"
                    element={<ForgotPasswordPage />}
                />
                {/* Reached from the link in the reset email. */}
                <Route
                    path="/coordinators/reset-password"
                    element={<ResetPasswordPage />}
                />
                <Route
                    path="/coordinators/dashboard"
                    element={
                        <RequireAuth>
                            <CoordinatorDashboard />
                        </RequireAuth>
                    }
                />
                {/* Day-of pages. Unlinked, and closed until two days
                    before the drive — the API enforces the same date. */}
                <Route
                    path="/coordinators/day-of"
                    element={
                        <RequireAuth>
                            <RequirePhaseTwo>
                                <DayOfStation />
                            </RequirePhaseTwo>
                        </RequireAuth>
                    }
                />
                {/* The clerk signs in here, by username. Kept ahead of the
                    worklist route so signing in is reachable while signed
                    out, and outside the phase gate so a wrong password on
                    the day doesn't look like a missing page. */}
                <Route
                    path="/coordinators/attendance/sign-in"
                    element={<AttendanceSignIn />}
                />
                <Route
                    path="/coordinators/attendance"
                    element={
                        <RequireAttendanceAuth>
                            <RequirePhaseTwo>
                                <AttendanceClerk />
                            </RequirePhaseTwo>
                        </RequireAttendanceAuth>
                    }
                />
                {/* Short aliases: the clerk is given one URL to type at a
                    desk, not a path under /coordinators. */}
                <Route
                    path="/attendance"
                    element={<Navigate to="/coordinators/attendance" replace />}
                />
                <Route
                    path="/attendance/sign-in"
                    element={
                        <Navigate to="/coordinators/attendance/sign-in" replace />
                    }
                />
                <Route element={<PublicLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/signup/student" element={<StudentPersonalInfo />} />
                    <Route path="/signup/teacher" element={<TeacherSignUp />} />
                    <Route
                        path="/signup/community-member"
                        element={<CommunityMemberSignUp />}
                    />
                    <Route path="/completed" element={<CompletedStudentForm />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
