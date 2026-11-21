import { expect, it } from "vite-plus/test";
import {
  type RestrictionEvent,
  restrictionDigest,
  verifyReceipt,
} from "../packages/backend/src/modules/lifecycle/restriction-journal";

const subject = {
  id: "9b92e0c5-fede-4eed-bc99-22fbbc66fa5e",
  accountId: "250dbeb0-da94-4de9-a164-cadaa8d2d6bd",
  generation: 3,
};

it("preserves the digest and receipt verification of a version 1 identity event", () => {
  const event = {
    ...subject,
    version: 1,
    operation: "device_session_revoked",
    sessionId: "dc48aaff-7946-4a46-9c97-4240f95622b1",
  } satisfies RestrictionEvent;
  const receipt = {
    eventId: event.id,
    sequence: 1,
    digest: "4cf7cb54eed4c975ebbc1b78662d9485c1e547beffa3dccc54dd388b9847a01e",
    receipt: "independently-saved-receipt",
  };
  expect(restrictionDigest(event)).toBe(receipt.digest);
  expect(verifyReceipt(event, receipt)).toEqual(receipt);
});

it("binds a version 2 receipt to the journey, the member and the exact membership generation", () => {
  const event = {
    ...subject,
    version: 2,
    operation: "membership_revocation",
    journeyId: "da716ed6-bf00-410f-a3c5-09a0058a9d80",
    membershipGeneration: "cdd359dc-0a82-405d-b525-3a8163055f90",
  } satisfies RestrictionEvent;
  const receipt = {
    eventId: event.id,
    sequence: 2,
    digest: "4cf7f605def1aa2d8ca42c030b3f666fdc8c71e18ee433ffd682fbf3dfd48eb3",
    receipt: "independently-saved-receipt",
  };
  expect(restrictionDigest(event)).toBe(receipt.digest);
  expect(verifyReceipt(event, receipt)).toEqual(receipt);
  for (const field of [
    "journeyId",
    "accountId",
    "membershipGeneration",
  ] as const) {
    expect(() =>
      verifyReceipt(
        { ...event, [field]: "879dba47-bebe-492a-90d0-72c65c1a9ac2" },
        receipt,
      ),
    ).toThrow("did not match");
  }
});
