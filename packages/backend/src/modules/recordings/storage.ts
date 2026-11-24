import { z } from "zod";
import { openObjectStore } from "../../storage.js";

const storageEnvironment = z.object({
  KAIRN_S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
  KAIRN_S3_BUCKET: z.string().min(1),
  KAIRN_S3_ACCESS_KEY: z.string().min(1),
  KAIRN_S3_SECRET_KEY: z.string().min(1),
});

export function openRecordingStore(input: NodeJS.ProcessEnv) {
  if (!input.KAIRN_S3_ENDPOINT) return undefined;
  const config = storageEnvironment.parse(input);
  return openObjectStore({
    endpoint: config.KAIRN_S3_ENDPOINT,
    region: "us-east-1",
    bucket: config.KAIRN_S3_BUCKET,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.KAIRN_S3_ACCESS_KEY,
      secretAccessKey: config.KAIRN_S3_SECRET_KEY,
    },
    requestTimeout: 20_000,
  });
}
