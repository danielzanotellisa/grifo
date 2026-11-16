import type { MailKind } from "@app/identity";

/**
 * Wording of the authentication emails in the default locale (pt-BR), until the i18n library is
 * chosen (docs/pending/P-009). Plain text only.
 */
export function mailText(kind: MailKind, url: string): { subject: string; text: string } {
  if (kind === "verification") {
    return {
      subject: "Confirme seu e-mail no Grifo",
      text: `Abra o link para confirmar seu e-mail (ele expira em 1 hora):\n\n${url}\n\nSe você não criou uma conta no Grifo, ignore esta mensagem.\n`,
    };
  }
  return {
    subject: "Redefinição de senha no Grifo",
    text: `Abra o link para escolher uma nova senha (ele expira em 1 hora):\n\n${url}\n\nSe você não pediu a redefinição, ignore esta mensagem.\n`,
  };
}
