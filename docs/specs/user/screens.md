# Sign-up and sign-in screens — spec

- Status: approved
- Module: apps/web
- ADRs: 0034, 0041

## Definition
The first screens a person uses: create an account, confirm the email, sign in and out. They call the authentication routes of `user` as they are; no new API.

## Screens
| Path | What it is |
| --- | --- |
| `/signup` | Sign up: name, email, password. |
| `/login` | Sign in: email, password. |
| `/` | Home: with a session, the email of the person and a sign-out button; without one, it sends the person to `/login`. |

## Rules
1. Every text is a key of `messages/pt-BR.json`; the error shown is chosen by the stable `code` of the Problem Details answer, never by its text.
2. The client trims name and email and checks the password length (10 to 128) before sending; the server still decides.
3. Sign-up always ends on the same message, "we sent a link to <email>", whatever the server answered with success (it answers the same for a new and for an existing email: `user#AC-4`). The request carries `callbackURL: "/login?verified=1"`, so the verification link lands on the sign-in screen, which then says the email was confirmed.
4. Errors: `INVALID_CREDENTIALS` → wrong email or password; `EMAIL_NOT_VERIFIED` → confirm the email first; `PASSWORD_INVALID` → the length rule; `RATE_LIMITED` → try again in `Retry-After` seconds; anything else → a generic message. Nothing reveals whether an email exists.
5. While a request is pending the submit button is disabled, so a second click or Enter sends nothing. The form submits with Enter.
6. Accessibility: every field has a visible label, the right `autocomplete` (`name`, `email`, `new-password`, `current-password`), errors are announced (`role="alert"`) and the first field with an error takes focus.
7. Out of this slice: forgot password, resending the verification email, deleting the account from the UI, Google.
8. A password field of the sign-up, sign-in, reset and deletion forms has a button that shows or hides the typed characters ("Mostrar caracteres" / "Ocultar caracteres"; the names avoid the word of the label). It changes only how the field is shown, and never sends the form.

## Acceptance criteria
- [ ] **AC-1** Given valid fields, when the sign-up form is sent, then one request goes out with the trimmed name and email, the password and `callbackURL`, and the screen shows the confirmation message with the email and no form.
- [ ] **AC-2** Given a blank name or email, or a password under 10 or over 128 characters, when the sign-up form is sent, then the field shows its error, takes focus and no request goes out.
- [ ] **AC-3** Given the server answers `PASSWORD_INVALID`, `RATE_LIMITED` (with `Retry-After`) or an unexpected error to a sign-up, then the screen shows the message of that code and keeps what was typed.
- [ ] **AC-4** Given valid credentials, when the sign-in form is sent, then the person goes to `/`.
- [ ] **AC-5** Given the server answers `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `RATE_LIMITED` (with `Retry-After`) or an unexpected error to a sign-in, then the screen shows the message of that code, keeps the email and clears the password.
- [ ] **AC-6** Given `/login?verified=1`, then the screen says the email was confirmed; given `/login` alone, then it does not.
- [ ] **AC-7** Given a request with no valid session, then the home path answers a redirect to `/login`; given a valid session, then it shows the email of the person, and signing out ends the session and goes to `/login`.
- [ ] **AC-8** Given a sign-up made with `callbackURL: "/login?verified=1"`, when the verification link of the email is opened, then the answer is a redirect to `/login?verified=1` and the email is verified.
- [ ] **AC-9** Given a form with a request pending, then its submit button is disabled and a second submit sends nothing; given any field, then it has an accessible name and the right `autocomplete`.
- [ ] **AC-10** Given a password field with a typed value, when its show button is used, then the characters are shown and the button offers to hide them, and using it again hides them; the form is not sent.

## Open questions
- Resending the verification email and the forgot-password screens are the next slice.
- The screens are tested as components (jsdom) and the server pieces with the database; a test that drives a real browser through sign-up and sign-in is not in CI yet.
