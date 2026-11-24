import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { createdJourney, journeyPath } from "@kairn/contracts/journeys";
import {
  acceptRecordingReview,
  commitRecordingBatch,
  commitRecordingImport,
  importReview,
  journeyRecordingOverview,
  journeyRecordingPage,
  recordingBatchOverlay,
  recordingBatchReview,
  recordingCommit,
  recordingDestination,
  recordingDestinationPage,
  recordingOverlay,
  recordingPlacementReview,
  recordingSectionPage,
  removedRecording,
  removeRecording,
  updateImportReview,
} from "@kairn/contracts/recordings";
import { bodyLimit } from "hono/body-limit";
import type { JourneyEnvironment, JourneyRouteGuards } from "./journeys.js";
import { errorResponse, privateHeaders, requireJson } from "./openapi.js";
import { problem } from "./problem.js";
import {
  errors,
  identityRequest,
  itemRequest,
  jsonResponse,
  mutationErrors,
  numericCursor,
} from "./recordings.js";

const reviewPath = "/api/v1/imports/{id}/review";
const destinationPath = "/api/v1/recording-attachment-destinations";
const placementReviewPath =
  "/api/v1/journeys/{journeyId}/recordings/{id}/placement/review";
const placementReviewParams = journeyPath.extend({ id: z.uuid() });
const cursorQuery = z.object({ cursor: z.uuid().optional() });
const revisionErrors = {
  ...mutationErrors,
  412: errorResponse(
    "The review or eligible membership changed.",
    privateHeaders,
  ),
  413: errorResponse("The body exceeds the request limit.", privateHeaders),
  415: errorResponse("A JSON body is required.", privateHeaders),
};

export function registerRecordingAttachmentRoutes(
  api: OpenAPIHono<JourneyEnvironment>,
  { operations, protect, authenticate, enforceWriteOrigin }: JourneyRouteGuards,
) {
  const service = operations?.recordingAttachments;
  const read = [protect, authenticate];
  const write = [
    ...read,
    enforceWriteOrigin,
    requireJson<JourneyEnvironment>(),
  ];

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/recording-batches/{id}/review",
      operationId: "readRecordingBatchReview",
      request: itemRequest,
      middleware: read,
      responses: {
        ...errors,
        200: jsonResponse(
          recordingBatchReview,
          "The owner's reviewed recording batch.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.reviewBatch(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      return result.status === 200
        ? context.json(result.review, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/recording-batches/{id}/overlay",
      operationId: "readRecordingBatchOverlay",
      request: itemRequest,
      middleware: read,
      responses: {
        ...errors,
        200: jsonResponse(
          recordingBatchOverlay,
          "A bounded map overview of the owner's reviewed recordings.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.overlayBatch(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      return result.status === 200
        ? context.json(result.overlay, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/recording-batches/{id}/commit",
      operationId: "commitRecordingBatch",
      middleware: [...write, bodyLimit({ maxSize: 4096 })],
      request: {
        ...itemRequest,
        body: {
          required: true,
          content: { "application/json": { schema: commitRecordingBatch } },
        },
      },
      responses: {
        ...revisionErrors,
        200: jsonResponse(
          createdJourney,
          "The private journey created for this reviewed batch.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.commitBatch(
        context.var.journeys.session,
        context.req.valid("param").id,
        context.req.valid("json"),
      );
      if (result.status === 200) return context.json({ id: result.id }, 200);
      if (result.status === 412)
        return problem(context, 412, { code: result.code });
      return problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: destinationPath,
      operationId: "listRecordingDestinations",
      middleware: read,
      request: { ...identityRequest, query: cursorQuery },
      responses: {
        ...errors,
        200: jsonResponse(
          recordingDestinationPage,
          "A page of eligible journey destinations.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.destinations(
        context.var.journeys.session,
        context.req.valid("query").cursor,
      );
      return result.status === 200
        ? context.json(result.page, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/recording-attachment-destinations/{journeyId}",
      operationId: "readRecordingDestination",
      middleware: read,
      request: {
        ...identityRequest,
        params: journeyPath,
        query: z.object({ importId: z.uuid().optional() }),
      },
      responses: {
        ...errors,
        200: jsonResponse(
          recordingDestination,
          "An eligible journey destination.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.destination(
        context.var.journeys.session,
        context.req.valid("param").journeyId,
        context.req.valid("query").importId,
      );
      return result.status === 200
        ? context.json(result.destination, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: reviewPath,
      operationId: "readImportReview",
      middleware: read,
      request: itemRequest,
      responses: {
        ...errors,
        200: jsonResponse(importReview, "The latest owner review."),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.review(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      return result.status === 200
        ? context.json(result.review, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "patch",
      path: reviewPath,
      operationId: "updateImportReview",
      middleware: [...write, bodyLimit({ maxSize: 192_000 })],
      request: {
        ...itemRequest,
        body: {
          required: true,
          content: { "application/json": { schema: updateImportReview } },
        },
      },
      responses: {
        ...revisionErrors,
        200: jsonResponse(importReview, "The saved immutable review revision."),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.updateReview(
        context.var.journeys.session,
        context.req.valid("param").id,
        context.req.valid("json"),
      );
      return result.status === 200
        ? context.json(result.review, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/imports/{id}/result",
      operationId: "readRecordingCommit",
      middleware: read,
      request: itemRequest,
      responses: {
        ...errors,
        200: jsonResponse(
          recordingCommit,
          "The most recent save receipt under current access.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.result(
        context.var.journeys.session,
        context.req.valid("param").id,
      );
      return "outcome" in result
        ? context.json(result.outcome, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/imports/{id}/commit",
      operationId: "commitRecordingImport",
      middleware: [...write, bodyLimit({ maxSize: 4096 })],
      request: {
        ...itemRequest,
        body: {
          required: true,
          content: { "application/json": { schema: commitRecordingImport } },
        },
      },
      responses: {
        ...revisionErrors,
        200: jsonResponse(
          recordingCommit,
          "The committed result under current access.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.commit(
        context.var.journeys.session,
        context.req.valid("param").id,
        context.req.valid("json"),
      );
      if ("outcome" in result) return context.json(result.outcome, 200);
      if ("issue" in result)
        return problem(context, 400, { issues: [result.issue] });
      return problem(
        context,
        result.status,
        "code" in result ? { code: result.code } : undefined,
      );
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/journeys/{journeyId}/recordings",
      operationId: "listJourneyRecordings",
      middleware: read,
      request: { ...identityRequest, params: journeyPath, query: cursorQuery },
      responses: {
        ...errors,
        200: jsonResponse(
          journeyRecordingPage,
          "Recordings this viewer is authorized to review.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.journeyList(
        context.var.journeys.session,
        context.req.valid("param").journeyId,
        context.req.valid("query").cursor,
      );
      return result.status === 200
        ? context.json(result.page, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "delete",
      path: "/api/v1/journeys/{journeyId}/recordings/{id}",
      operationId: "removeJourneyRecording",
      middleware: [...write, bodyLimit({ maxSize: 4096 })],
      request: {
        ...identityRequest,
        params: journeyPath.extend({ id: z.uuid() }),
        body: {
          required: true,
          content: { "application/json": { schema: removeRecording } },
        },
      },
      responses: {
        ...revisionErrors,
        200: jsonResponse(removedRecording, "The recording has been detached."),
        202: jsonResponse(
          removedRecording,
          "The recording has been detached. Independent confirmation is pending.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, id } = context.req.valid("param");
      const result = await service.detach(
        context.var.journeys.session,
        journeyId,
        id,
        context.req.valid("json").expectedGrantRevision,
      );
      if (!("confirmation" in result)) return problem(context, result.status);
      return context.json(
        { id, confirmation: result.confirmation },
        result.status,
      );
    },
  );

  api.openapi(
    createRoute({
      method: "delete",
      path: "/api/v1/journeys/{journeyId}/recordings/{id}/placement",
      operationId: "removeRecordingPlacement",
      middleware: [...write, bodyLimit({ maxSize: 4096 })],
      request: {
        ...identityRequest,
        params: journeyPath.extend({ id: z.uuid() }),
        body: {
          required: true,
          content: { "application/json": { schema: removeRecording } },
        },
      },
      responses: {
        ...revisionErrors,
        200: jsonResponse(
          removedRecording,
          "The recording was removed from the shared draft.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, id } = context.req.valid("param");
      const result = await service.removePlacement(
        context.var.journeys.session,
        journeyId,
        id,
        context.req.valid("json").expectedGrantRevision,
      );
      return result.status === 200
        ? context.json({ id, confirmation: "confirmed" as const }, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: placementReviewPath,
      operationId: "readPlacementReview",
      middleware: read,
      request: { ...identityRequest, params: placementReviewParams },
      responses: {
        ...errors,
        412: revisionErrors[412],
        200: jsonResponse(
          recordingPlacementReview,
          "The current correction available to the shared draft.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, id } = context.req.valid("param");
      const result = await service.placementReview(
        context.var.journeys.session,
        journeyId,
        id,
      );
      return result.status === 200
        ? context.json({ review: result.review }, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "patch",
      path: placementReviewPath,
      operationId: "acceptPlacementReview",
      middleware: [...write, bodyLimit({ maxSize: 4096 })],
      request: {
        ...identityRequest,
        params: placementReviewParams,
        body: {
          required: true,
          content: { "application/json": { schema: acceptRecordingReview } },
        },
      },
      responses: {
        ...revisionErrors,
        200: jsonResponse(
          recordingPlacementReview,
          "The shared draft accepted the correction.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, id } = context.req.valid("param");
      const result = await service.placementReview(
        context.var.journeys.session,
        journeyId,
        id,
        context.req.valid("json").token,
      );
      return result.status === 200
        ? context.json({ review: result.review }, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/journeys/{journeyId}/recordings/overview",
      operationId: "readJourneyRecordingOverview",
      middleware: read,
      request: { ...identityRequest, params: journeyPath },
      responses: {
        ...errors,
        200: jsonResponse(
          journeyRecordingOverview,
          "A bounded overview of recorded paths authorized for this viewer.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const result = await service.journeyOverview(
        context.var.journeys.session,
        context.req.valid("param").journeyId,
      );
      return result.status === 200
        ? context.json(result.overlay, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/journeys/{journeyId}/recordings/{id}/overlay",
      operationId: "readJourneyRecordingOverlay",
      middleware: read,
      request: {
        ...identityRequest,
        params: journeyPath.extend({ id: z.uuid() }),
        query: z.object({
          cursor: numericCursor.optional(),
          through: numericCursor,
        }),
      },
      responses: {
        ...errors,
        200: jsonResponse(
          recordingOverlay,
          "Bounded coordinates authorized for this journey viewer.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, id } = context.req.valid("param");
      const { cursor, through } = context.req.valid("query");
      const result = await service.journeyOverlay(
        context.var.journeys.session,
        journeyId,
        id,
        cursor,
        through,
      );
      return result.status === 200
        ? context.json(result.overlay, 200)
        : problem(context, result.status);
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/journeys/{journeyId}/recordings/{id}/segments",
      operationId: "listJourneyRecordingSections",
      middleware: read,
      request: {
        ...identityRequest,
        params: journeyPath.extend({ id: z.uuid() }),
        query: z.object({ cursor: numericCursor.optional() }),
      },
      responses: {
        ...errors,
        200: jsonResponse(
          recordingSectionPage,
          "A page of authorized recording sections.",
        ),
      },
    }),
    async (context) => {
      if (!service) return problem(context, 503);
      const { journeyId, id } = context.req.valid("param");
      const result = await service.journeySections(
        context.var.journeys.session,
        journeyId,
        id,
        context.req.valid("query").cursor,
      );
      return result.status === 200
        ? context.json(result.page, 200)
        : problem(context, result.status);
    },
  );
}
