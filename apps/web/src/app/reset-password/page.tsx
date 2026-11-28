import { AuthFrame } from "../../features/auth/auth-frame";
import { ResetPasswordForm } from "../../features/auth/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthFrame>
      <ResetPasswordForm token={token} error={error} />
    </AuthFrame>
  );
}
