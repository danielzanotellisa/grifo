# Account screens — spec

- Status: approved
- Module: apps/web
- ADRs: 0034, 0041
- Related: `user`, `user/screens`, `user/lifecycle`, `user/email`

## Definition
The screens the first account slice left out (`user/screens` rule 7): asking for a new password and choosing it, asking for the confirmation e-mail again, and deleting the account. The server already does all of it (`user`, `user/lifecycle`); these screens only call it.

## Screens
| Path | What it is |
| --- | --- |
| `/forgot-password` | Asks for an e-mail address and requests the reset link. |
| `/reset-password?token=…` | Sets the new password with the token of the link. |
| `/account` | The e-mail of the person and the deletion of the account. Without a session it redirects to `/login`. |

The sign-in screen links to `/forgot-password`; the signed-in frame links to `/account` ("Conta").

## Rules
1. Forgot password: the e-mail is trimmed and required. It sends `POST /api/auth/request-password-reset` `{ email, redirectTo: "/reset-password" }`. Whatever the server answers with success, the form is replaced by "Se existir uma conta com {email}, enviamos um link para criar uma nova senha." (the same for a known and an unknown address, `user#AC-2`). A rate limit, a network failure or anything else shows its message and keeps the form.
2. Reset password: the new password has 10 to 128 characters (checked before sending). It sends `POST /api/auth/reset-password` `{ newPassword, token }`; on success the person goes to `/login?reset=1`, which says "Senha alterada. Entre com a nova senha." A missing token, an `error` in the query, or the code `INVALID_TOKEN` shows "Este link é inválido ou expirou." with a link to `/forgot-password`.
3. Resend confirmation: when sign-in answers `EMAIL_NOT_VERIFIED`, the screen offers "Reenviar e-mail de confirmação". It sends `POST /api/auth/send-verification-email` `{ email, callbackURL: "/login?verified=1" }` with the typed e-mail and then says "Enviamos um novo link para {email}." whatever the server answered with success.
4. Delete account: `/account` shows "Excluir conta" with the warning that the account and its data are deleted after 30 days and that the person is signed out now, a password field ("Senha atual") and the button "Excluir minha conta". It sends `POST /api/account/delete` `{ password }`; on success (204) the person goes to `/login`. A blank password is refused before sending; `INVALID_CREDENTIALS` says "Senha incorreta."; `RATE_LIMITED`, a network failure and anything else show their messages; `UNAUTHENTICATED` goes to `/login`.
5. While a request is pending its button is disabled, so a second click or Enter sends nothing; errors are announced (`role="alert"`); every field has a visible label; every text is a key of `messages/pt-BR.json`.

## Acceptance criteria
- [ ] **AC-1** Given an e-mail, when the reset is requested, then one request with the trimmed e-mail and `redirectTo: "/reset-password"` goes out and the confirmation replaces the form; a blank e-mail sends nothing; a rate limit or a network failure shows its message and keeps the form.
- [ ] **AC-2** Given a token and a password of 10 to 128 characters, when the new password is sent, then one request with both goes out and the person goes to `/login?reset=1`; a shorter or longer password is refused without sending; `INVALID_TOKEN`, a missing token or an `error` in the query show the invalid-link message with the link to `/forgot-password`; `PASSWORD_INVALID`, `RATE_LIMITED` and other failures show their messages.
- [ ] **AC-3** Given `?reset=1`, then the sign-in screen says the password was changed; and it has a link to `/forgot-password`.
- [ ] **AC-4** Given a sign-in that answers `EMAIL_NOT_VERIFIED`, then "Reenviar e-mail de confirmação" is offered, it sends the request with the typed e-mail and the callback, and then says the link was sent; the offer is not shown for other errors.
- [ ] **AC-5** Given the account page, then it shows the e-mail; given the right password, when the account is deleted, then one request with the password goes out and the person goes to `/login`; a blank password is refused without sending.
- [ ] **AC-6** Given `INVALID_CREDENTIALS`, `RATE_LIMITED`, a network failure or another failure on deletion, then its message is shown and the person stays; `UNAUTHENTICATED` goes to `/login`.
- [ ] **AC-7** Given the real app in a browser, when a person asks for a new password, opens the link of the e-mail, chooses a password and signs in with it, then it works; and when the account is deleted with its password, then signing in is refused.
