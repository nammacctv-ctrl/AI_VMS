import { SignupForm } from "@/components/SignupForm";
import { publicSignupEnabled } from "@/lib/config";

export default function Signup() {
  if (!publicSignupEnabled()) {
    return (
      <div className="center">
        <h1>Create a panel</h1>
        <div className="card"><p>New panels are set up by our team so we can brand and test them with you first.</p>
          <p className="muted small">Please contact Namma CCTV Private Limited to get yours.</p></div>
      </div>
    );
  }
  return <SignupForm />;
}
