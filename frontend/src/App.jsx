import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";

import "./index.css";
import Header from "./Header.jsx";
import HomePage from "./HomePage.jsx";
import StudentPersonalInfo from "./StudentPersonalInfo.jsx";
import CompletedStudentForm from "./CompletedStudentForm.jsx";
import TeacherSignUp from "./TeacherSignUp.jsx";
import CommunityMemberSignUp from "./CommunityMemberSignUp.jsx";
import CoordinatorsPage from "./CoordinatorsPage.jsx";
import CoordinatorRegisterPage from "./CoordinatorRegisterPage.jsx";
import CoordinatorDashboard from "./CoordinatorDashboard.jsx";
import RequireAuth from "./RequireAuth.jsx";
import RequirePhaseTwo from "./RequirePhaseTwo.jsx";
import DayOfStation from "./DayOfStation.jsx";
import AttendanceClerk from "./AttendanceClerk.jsx";

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
                {/* Unlinked on purpose — the URL goes out to invitees only. */}
                <Route
                    path="/coordinators/register"
                    element={<CoordinatorRegisterPage />}
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
                <Route
                    path="/coordinators/attendance"
                    element={
                        <RequireAuth>
                            <RequirePhaseTwo>
                                <AttendanceClerk />
                            </RequirePhaseTwo>
                        </RequireAuth>
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
