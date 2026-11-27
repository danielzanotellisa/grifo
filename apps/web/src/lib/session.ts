import { authenticate } from "@app/identity";
import { getAuth } from "../composition";

/** The person of a request (verified session, live account), or null. Pages call it and redirect on null. */
export const currentUser = (headers: Headers) => authenticate(getAuth(), headers);
