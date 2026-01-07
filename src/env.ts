import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    FRIENDLI_TOKEN: z.string().min(1),
    EXPERIMENTAL_TRIM_TRAILING_NEWLINES: z.stringbool().default(true),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
