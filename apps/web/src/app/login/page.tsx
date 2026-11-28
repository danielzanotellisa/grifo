import { AuthFrame } from "../../features/auth/auth-frame";
import { SignInForm } from "../../features/auth/sign-in-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; reset?: string }>;
}) {
  const { verified, reset } = await searchParams;
  return (
    <AuthFrame>
      <SignInForm verified={verified === "1"} reset={reset === "1"} />
    </AuthFrame>
  );
}
