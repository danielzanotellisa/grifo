import { SignUpForm } from "../../features/auth/sign-up-form";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
      <SignUpForm />
    </main>
  );
}
