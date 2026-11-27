import { getRequestConfig } from "next-intl/server";

/** The product has one locale for now (pt-BR); every UI string comes from `messages/<locale>.json`. */
export const LOCALE = "pt-BR";

export default getRequestConfig(async () => ({
  locale: LOCALE,
  messages: (await import(`../../messages/${LOCALE}.json`)).default,
}));
