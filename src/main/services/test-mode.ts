import { app } from "electron";

// Side-effect-only module: must be the FIRST import in main/index.ts so that
// `app.setPath("userData", ...)` runs before any module that calls
// `app.getPath("userData")` (e.g. src/utils/prisma.ts) is evaluated.
if (process.env.BID_DOC_E2E_USER_DATA) {
  app.setPath("userData", process.env.BID_DOC_E2E_USER_DATA);
}
