export interface IdentityDevices {
  currentDeviceId: string;
  devices: { id: string; createdAt: string; expiresAt: string }[];
  pendingRestrictions: number;
}

export interface RestrictionConfirmation {
  status: true;
  eventId: string;
  confirmation: "pending" | "confirmed";
}
