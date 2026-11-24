import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  paginateListObjectsV2,
  paginateListParts,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from "@aws-sdk/client-s3";

type UploadBody = Readable | Uint8Array;
type PartReceipt = { partNumber: number; etag: string };
type ObjectDigest = { size: number; sha256: string };

type StorageOptions = {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  requestTimeout?: number;
  credentials?: { accessKeyId: string; secretAccessKey: string };
};

export function openObjectStore({
  bucket,
  requestTimeout,
  ...options
}: StorageOptions) {
  const client = new S3Client({
    ...options,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler:
      requestTimeout === undefined
        ? undefined
        : { requestTimeout, throwOnRequestTimeout: true },
  });

  const object = (key: string) => ({ Bucket: bucket, Key: key });

  async function get(key: string, range?: string) {
    const response = await client.send(
      new GetObjectCommand({
        ...object(key),
        Range: range,
      }),
    );
    if (!(response.Body instanceof Readable)) {
      throw new Error("Object store did not return a Node stream.");
    }
    if (requestTimeout !== undefined) {
      const body = response.Body;
      const deadline = AbortSignal.timeout(requestTimeout);
      const expire = () =>
        body.destroy(new Error("Object download timed out."));
      deadline.addEventListener("abort", expire, { once: true });
      body.once("close", () => deadline.removeEventListener("abort", expire));
    }
    return {
      body: response.Body,
      size: response.ContentLength,
      contentType: response.ContentType,
      contentRange: response.ContentRange,
      etag: response.ETag,
    };
  }

  return {
    async put(
      key: string,
      body: UploadBody,
      size: number,
      contentType: string,
    ) {
      await client.send(
        new PutObjectCommand({
          ...object(key),
          Body: body,
          ContentLength: size,
          ContentType: contentType,
        }),
      );
    },

    async head(key: string) {
      try {
        const response = await client.send(new HeadObjectCommand(object(key)));
        return {
          size: response.ContentLength,
          contentType: response.ContentType,
          etag: response.ETag,
        };
      } catch (error) {
        if (
          error instanceof S3ServiceException &&
          error.$metadata.httpStatusCode === 404
        ) {
          return null;
        }
        throw error;
      }
    },

    get,

    async remove(key: string) {
      await client.send(new DeleteObjectCommand(object(key)));
    },

    async *list(prefix: string) {
      const pages = paginateListObjectsV2(
        { client },
        { Bucket: bucket, Prefix: prefix },
      );
      for await (const page of pages) {
        for (const item of page.Contents ?? []) {
          if (item.Key !== undefined) {
            yield { key: item.Key, size: item.Size };
          }
        }
      }
    },

    async beginMultipart(key: string, contentType: string) {
      const response = await client.send(
        new CreateMultipartUploadCommand({
          ...object(key),
          ContentType: contentType,
        }),
      );
      if (!response.UploadId) {
        throw new Error("Object store did not return an upload ID.");
      }
      return response.UploadId;
    },

    async putPart(
      key: string,
      uploadId: string,
      partNumber: number,
      body: UploadBody,
      size: number,
    ) {
      const response = await client.send(
        new UploadPartCommand({
          ...object(key),
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: body,
          ContentLength: size,
        }),
      );
      if (!response.ETag) {
        throw new Error("Object store did not return a multipart receipt.");
      }
      return { partNumber, etag: response.ETag };
    },

    async listParts(key: string, uploadId: string) {
      const parts: (PartReceipt & { size: number })[] = [];
      const pages = paginateListParts(
        { client },
        {
          ...object(key),
          UploadId: uploadId,
        },
      );
      for await (const page of pages) {
        for (const part of page.Parts ?? []) {
          if (
            part.PartNumber === undefined ||
            !part.ETag ||
            part.Size === undefined
          ) {
            throw new Error(
              "Object store returned an incomplete multipart receipt.",
            );
          }
          parts.push({
            partNumber: part.PartNumber,
            etag: part.ETag,
            size: part.Size,
          });
        }
      }
      return parts;
    },

    async completeMultipart(
      key: string,
      uploadId: string,
      parts: readonly PartReceipt[],
    ) {
      await client.send(
        new CompleteMultipartUploadCommand({
          ...object(key),
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts
              .toSorted((left, right) => left.partNumber - right.partNumber)
              .map(({ partNumber, etag }) => ({
                PartNumber: partNumber,
                ETag: etag,
              })),
          },
        }),
      );
    },

    async abortMultipart(key: string, uploadId: string) {
      await client.send(
        new AbortMultipartUploadCommand({
          ...object(key),
          UploadId: uploadId,
        }),
      );
    },

    async verify(key: string, expected: ObjectDigest) {
      const { body, size } = await get(key);
      const hash = createHash("sha256");
      let received = 0;
      try {
        if (size !== expected.size) {
          return false;
        }
        for await (const chunk of body) {
          received += chunk.length;
          if (received > expected.size) {
            return false;
          }
          hash.update(chunk);
        }
        return (
          received === expected.size && hash.digest("hex") === expected.sha256
        );
      } finally {
        body.destroy();
      }
    },

    close() {
      client.destroy();
    },
  };
}
