import { Link, Navigate, useLocation } from "react-router-dom";

export default function CompletedStudentForm() {
    const { state } = useLocation();
    const email = state?.email;

    // Reached without going through the form (direct URL, cleared history):
    // there is nothing to confirm, so send them back to sign up.
    if (!email) {
        return <Navigate to="/signup" replace />;
    }

    return (
        <main className="page">
            <section>
                <h1 className="section-title">You're registered</h1>
                <div className="section-body">
                    <p className="form-prompt">
                        Thanks for signing up for the Stanford Blood Drive. We'll
                        send your assigned donation time slot to{" "}
                        <strong>{email}</strong> by 8/12 at 2:30 PM.
                    </p>
                    <Link to="/" className="submit-btn">
                        Back to home
                    </Link>
                </div>
            </section>
        </main>
    );
}
