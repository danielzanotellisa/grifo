import { AuthFrame } from "../../features/auth/auth-frame";
import { ForgotPasswordForm } from "../../features/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthFrame>
      <ForgotPasswordForm />
    </AuthFrame>
  );
}
