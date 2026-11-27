import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// `findBy` and `waitFor` wait 1 s by default, which a busy machine or a small CI runner can exceed.
configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);
