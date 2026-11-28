import { AuthFrame } from "../../features/auth/auth-frame";
import { SignUpForm } from "../../features/auth/sign-up-form";

export default function SignUpPage() {
  return (
    <AuthFrame>
      <SignUpForm />
    </AuthFrame>
  );
}
