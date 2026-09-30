import CollapsibleSection from "./CollapsibleSection.jsx";
import ConsentFormLinks from "./ConsentFormLinks.jsx";
import { EligibilityLink } from "./EligibilityRequirements.jsx";
import HomeHero from "./HomeHero.jsx";
import SignUpCta from "./SignUpCta.jsx";
import { CONTACT_EMAIL } from "./contact.js";

export default function HomePage() {
    return (
        <main className="home-page">
            <HomeHero />

            <CollapsibleSection title="Why should I donate to the MVHS annual Stanford blood drive?">
                <div className="overview-text">
                    <p>
                        Donating blood is a simple way to make a meaningful difference in our community. 
                        Blood is needed every day for patients undergoing surgery, cancer treatment, emergency care, and other medical procedures. 
                        Stanford Blood Center helps provide blood to those patients who depend on volunteer donors, and one donation can save up to 3 lives. 
                        
                    </p>
                    <p>
                        By donating at the MVHS Stanford Blood Drive, you are helping to support patients and their families, while encouraging others to give back as well. 
                        (And as a bonus, there is a $20 gift card as a token of appreciation for donors)
                    </p>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Am I eligible to donate to the Stanford Blood Drive?">
                <div className="overview-text">
                    <p>
                        In general, 16-year-olds may donate with parent or legal guardian consent, while donors 17 and older do not need parental consent. Donors must also meet additional eligibility requirements, such as height/weight requirements, be feeling well, and complete a health history screening. Because eligibility can vary based on individual circumstances, please review Stanford Blood Center’s full eligibility requirements below.
                    </p>
                </div>
                <div className="home-links">
                    <EligibilityLink />
                    <ConsentFormLinks />
                </div>
            </CollapsibleSection>

            <aside className="home-contact">
                <p>
                    Questions about the blood drive, or need to change or cancel
                    your appointment? Email us at{" "}
                    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                </p>
            </aside>

            {/* Opens into the three participant routes on hover. */}
            <SignUpCta />
        </main>
    );
}
