import { SignInForm } from "../../features/auth/sign-in-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; reset?: string }>;
}) {
  const { verified, reset } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
      <SignInForm verified={verified === "1"} reset={reset === "1"} />
    </main>
  );
}
