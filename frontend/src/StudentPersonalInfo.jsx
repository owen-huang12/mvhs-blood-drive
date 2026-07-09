export default function StudentPersonalInfo({
    name,
    setName,
    studentId,
    setStudentId,
    email,
    setEmail,
    grade,
    setGrade,
    handleSubmit,
}) {
    return (
        <main className="page">
            <section>
                <h2 className="section-title">
                    Overview of the Stanford Blood Drive
                </h2>
                <div className="overview-text">
                    <p>
                        Lorem ipsum dolor sit amet consectetur adipiscing elit.
                        Quisque faucibus ex sapien vitae pellentesque sem
                        placerat. In id cursus mi pretium tellus duis convallis.
                        Tempus leo eu aenean sed diam urna tempor. Pulvinar
                        vivamus fringilla lacus nec metus bibendum egestas.
                        Iaculis massa nisl malesuada lacinia integer nunc
                        posuere.
                    </p>
                    <p>
                        Lorem ipsum dolor sit amet consectetur adipiscing elit.
                        Quisque faucibus ex sapien vitae pellentesque sem
                        placerat. In id cursus mi pretium tellus duis convallis.
                        Tempus leo eu aenean sed diam urna tempor.
                    </p>
                </div>
            </section>

            <section className="form-section">
                <h2 className="section-title">Sign Up</h2>
                <p className="form-prompt">
                    Please fill out the form below with your information to
                    register for the blood drive. All fields are required.
                </p>
                <form className="signup-form" onSubmit={handleSubmit}>
                    <div className="form-field">
                        <label htmlFor="name">Full Name <span className="required">*</span></label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Please enter your full name"
                            required
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="studentId">Student ID <span className="required">*</span></label>
                        <input
                            id="studentId"
                            type="text"
                            value={studentId}
                            onChange={(e) => setStudentId(e.target.value)}
                            placeholder="1000XXXXX"
                            required
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="email">Email (preferred email) <span className="required">*</span></label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="1000XXXX@mvla.net"
                            required
                        />
                    </div>
                    <div className="form-field">
                        <span className="form-field-label">Grade <span className="required">*</span></span>
                        <div className="grade-options">
                            {["9th", "10th", "11th", "12th"].map((g) => (
                                <label key={g} className="grade-radio">
                                    <input
                                        type="radio"
                                        name="grade"
                                        value={g}
                                        checked={grade === g}
                                        onChange={(e) => setGrade(e.target.value)}
                                    />
                                    {g}
                                </label>
                            ))}
                        </div>
                    </div>
                    <button type="submit" className="submit-btn">
                        Register
                    </button>
                </form>
            </section>
        </main>
    );
}
