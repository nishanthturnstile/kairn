import { type ChildProcess, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import {
  enqueueWorkerCheck,
  openDatabase,
  openJobQueue,
  openMailTransport,
  openObjectStore,
} from "../../packages/backend/src/index";
import { workerCheckQueue } from "../../packages/backend/src/jobs";

const databaseUrl =
  process.env.KAIRN_TEST_DATABASE_URL ??
  "postgresql://kairn_runtime:local-runtime-only@127.0.0.1:55432/kairn";
const endpoint = process.env.KAIRN_TEST_S3_ENDPOINT ?? "http://127.0.0.1:58333";
const bucket = process.env.KAIRN_S3_BUCKET ?? "kairn-private";

async function startWorker() {
  const worker = spawn(
    process.execPath,
    ["--import", "tsx", "--conditions=development", "src/index.ts"],
    {
      cwd: fileURLToPath(new URL("../../apps/worker/", import.meta.url)),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  worker.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  worker.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  try {
    await expect
      .poll(
        () => {
          if (worker.exitCode !== null) {
            throw new Error(`Worker exited before startup. ${output}`);
          }
          return output;
        },
        { timeout: 8_000 },
      )
      .toContain("Kairn worker is listening");
    return worker;
  } catch (error) {
    if (worker.exitCode === null) {
      worker.kill("SIGKILL");
    }
    throw error;
  }
}

async function stopWorker(worker: ChildProcess) {
  if (worker.exitCode !== null) {
    expect(worker.exitCode).toBe(0);
    return;
  }
  const exited = once(worker, "exit", { signal: AbortSignal.timeout(6_000) });
  worker.kill("SIGTERM");
  try {
    await expect(exited).resolves.toEqual([0, null]);
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) {
      worker.kill("SIGKILL");
    }
  }
}

describe.runIf(process.env.KAIRN_INTEGRATION === "1")("local services", () => {
  let database: ReturnType<typeof openDatabase>;
  let jobs: ReturnType<typeof openJobQueue>;
  let storage: ReturnType<typeof openObjectStore>;

  beforeAll(async () => {
    database = openDatabase(databaseUrl);
    jobs = openJobQueue(databaseUrl);
    storage = openObjectStore({
      endpoint,
      bucket,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.KAIRN_S3_ACCESS_KEY ?? "kairn-local",
        secretAccessKey:
          process.env.KAIRN_S3_SECRET_KEY ?? "local-storage-only",
      },
    });
    await jobs.start();
  });

  afterAll(async () => {
    storage?.close();
    try {
      await jobs?.stop();
    } finally {
      await database?.pool.end();
    }
  });

  it("executes PostGIS and pgvector queries with the runtime role", async () => {
    const { rows } = await database.pool.query(`
      SELECT ST_AsText(ST_MakePoint(77, 12)) AS point,
             '[1,2,3]'::vector <-> '[1,2,3]'::vector AS distance,
             has_database_privilege(current_user, current_database(), 'CREATE') AS can_create,
             has_schema_privilege(current_user, 'drizzle', 'USAGE') AS can_read_migrations
    `);
    expect(rows).toEqual([
      {
        point: "POINT(77 12)",
        distance: 0,
        can_create: false,
        can_read_migrations: false,
      },
    ]);
  });

  it("rolls back the row and the pg-boss job together", async () => {
    const id = randomUUID();
    await expect(
      database.db.transaction(async (transaction) => {
        await enqueueWorkerCheck(transaction, jobs, id);
        throw new Error("rollback fixture");
      }),
    ).rejects.toThrow("rollback fixture");

    expect(await jobs.getJobById(workerCheckQueue, id)).toBeNull();
    const { rowCount } = await database.pool.query(
      "SELECT id FROM kairn.worker_checks WHERE id = $1",
      [id],
    );
    expect(rowCount).toBe(0);
  });

  it("processes a job committed while the worker is stopped", async () => {
    const id = randomUUID();
    const initialWorker = await startWorker();
    await stopWorker(initialWorker);

    try {
      await database.db.transaction((transaction) =>
        enqueueWorkerCheck(transaction, jobs, id),
      );
      expect((await jobs.getJobById(workerCheckQueue, id))?.state).toBe(
        "created",
      );

      const restartedWorker = await startWorker();
      try {
        await expect
          .poll(
            async () => (await jobs.getJobById(workerCheckQueue, id))?.state,
            {
              timeout: 8_000,
            },
          )
          .toBe("completed");
        const { rows } = await database.pool.query(
          "SELECT processed_at FROM kairn.worker_checks WHERE id = $1",
          [id],
        );
        expect(rows[0]?.processed_at).toBeInstanceOf(Date);
      } finally {
        await stopWorker(restartedWorker);
      }
    } finally {
      await jobs.deleteJob(workerCheckQueue, id);
      await database.pool.query(
        "DELETE FROM kairn.worker_checks WHERE id = $1",
        [id],
      );
    }
  }, 25_000);

  it("streams private objects and supports HEAD, ranges, listing and deletion", async () => {
    const prefix = `conformance/${randomUUID()}/`;
    const key = `${prefix}stream.bin`;
    const content = Buffer.from("streamed object");
    try {
      await storage.put(
        key,
        Readable.from([content]),
        content.length,
        "application/octet-stream",
      );
      expect(await storage.head(key)).toMatchObject({
        size: content.length,
        contentType: "application/octet-stream",
      });
      const download = await storage.get(key, "bytes=0-5");
      expect(download.contentRange).toBe(`bytes 0-5/${content.length}`);
      expect((await buffer(download.body)).toString()).toBe("stream");
      expect(await Array.fromAsync(storage.list(prefix))).toEqual([
        { key, size: content.length },
      ]);

      const anonymous = await fetch(`${endpoint}/${bucket}/${key}`);
      expect(anonymous.status).toBe(403);
      await anonymous.body?.cancel();
    } finally {
      await storage.remove(key);
    }
    expect(await storage.head(key)).toBeNull();
  });

  it("lists multipart receipts, completes uploads and verifies the whole-file SHA-256", async () => {
    const key = `conformance/${randomUUID()}/multipart.bin`;
    const first = Buffer.alloc(5 * 1024 * 1024, "a");
    const last = Buffer.from("zzz");
    const size = first.length + last.length;
    const sha256 = createHash("sha256")
      .update(first)
      .update(last)
      .digest("hex");
    const uploadId = await storage.beginMultipart(
      key,
      "application/octet-stream",
    );
    let completed = false;
    try {
      const firstReceipt = await storage.putPart(
        key,
        uploadId,
        1,
        Readable.from([first]),
        first.length,
      );
      const lastReceipt = await storage.putPart(
        key,
        uploadId,
        2,
        last,
        last.length,
      );
      expect(await storage.listParts(key, uploadId)).toEqual([
        { ...firstReceipt, size: first.length },
        { ...lastReceipt, size: last.length },
      ]);

      await storage.completeMultipart(key, uploadId, [
        lastReceipt,
        firstReceipt,
      ]);
      completed = true;
      expect(await storage.verify(key, { size, sha256 })).toBe(true);
      expect(await storage.verify(key, { size, sha256: "0".repeat(64) })).toBe(
        false,
      );
      expect(await storage.verify(key, { size: size - 1, sha256 })).toBe(false);

      const download = await storage.get(key, `bytes=${first.length - 2}-`);
      expect((await buffer(download.body)).toString()).toBe("aazzz");
    } finally {
      if (!completed) {
        await storage.abortMultipart(key, uploadId);
      }
      await storage.remove(key);
    }
  }, 20_000);

  it("aborts an incomplete multipart upload", async () => {
    const key = `conformance/${randomUUID()}/aborted.bin`;
    const uploadId = await storage.beginMultipart(
      key,
      "application/octet-stream",
    );
    try {
      await storage.putPart(key, uploadId, 1, Buffer.from("unfinished"), 10);
    } finally {
      await storage.abortMultipart(key, uploadId);
    }
    await expect(storage.listParts(key, uploadId)).rejects.toThrow();
    expect(await storage.head(key)).toBeNull();
  });

  it("captures a synthetic SMTP message in Mailpit", async () => {
    const smtpUrl = process.env.KAIRN_TEST_SMTP_URL ?? "smtp://127.0.0.1:51025";
    const mailpit =
      process.env.KAIRN_TEST_MAILPIT_URL ?? "http://127.0.0.1:58025";
    const mail = openMailTransport(smtpUrl);
    const subject = `Kairn conformance ${randomUUID()}`;
    try {
      await mail.send({
        from: "sender@example.invalid",
        to: "recipient@example.invalid",
        subject,
        text: "Synthetic test message.",
      });
      const response = await fetch(`${mailpit}/api/v1/messages`);
      expect(response.ok).toBe(true);
      expect(await response.json()).toMatchObject({
        messages: expect.arrayContaining([
          expect.objectContaining({ Subject: subject }),
        ]),
      });
    } finally {
      mail.close();
    }
  });
});
