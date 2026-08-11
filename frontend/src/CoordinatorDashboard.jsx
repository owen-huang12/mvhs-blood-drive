import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header.jsx";
import { clearToken } from "./auth.js";
import { getCurrentCoordinator } from "./api.js";

const initialsOf = (name) =>
    name
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

export default function CoordinatorDashboard() {
    const [name, setName] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        getCurrentCoordinator()
            .then((data) => setName(data.full_name))
            .catch(() => {});
    }, []);

    const handleSignOut = () => {
        clearToken();
        navigate("/coordinators");
    };

    return (
        <div className="dashboard-page">
            <Header>
                <button className="profile-pill" onClick={handleSignOut} title="Sign out">
                    <span className="profile-avatar">{initialsOf(name)}</span>
                    <span className="profile-name">{name}</span>
                </button>
            </Header>

            <main className="dashboard-content">
                <h2 className="dashboard-section-title">Coordinator Dashboard</h2>
                <div className="dashboard-body">Dashboard coming soon.</div>
            </main>
        </div>
    );
}
