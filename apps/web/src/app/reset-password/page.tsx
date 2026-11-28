import { ResetPasswordForm } from "../../features/auth/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
      <ResetPasswordForm token={token} error={error} />
    </main>
  );
}
