import CollapsibleSection from "./CollapsibleSection.jsx";
import HomeHero from "./HomeHero.jsx";
import SignUpCta from "./SignUpCta.jsx";
import placeholder1 from "./assets/placeholder_1.png";
import placeholder2 from "./assets/placeholder_2.png";

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
                <div className="photo-stack">
                    <img src={placeholder1} alt="" className="photo-placeholder" />
                    <img src={placeholder2} alt="" className="photo-placeholder" />
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Am I eligible to donate to the Stanford Blood Drive?">
                <div className="overview-text">
                    <p>
                        In general, 16-year-olds may donate with parent or legal guardian consent, while donors 17 and older do not need parental consent. Donors must also meet additional eligibility requirements, such as height/weight requirements, be feeling well, and complete a health history screening. Because eligibility can vary based on individual circumstances, please review Stanford Blood Center’s full eligibility requirements here.
                    </p>
                </div>
            </CollapsibleSection>

            {/* Opens into the three participant routes on hover. */}
            <SignUpCta />
        </main>
    );
}
