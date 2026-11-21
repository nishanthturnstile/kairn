import type { CreateJourney } from "@kairn/contracts";
import { createJourney } from "@kairn/contracts/journeys";
import type { SQLiteDatabase } from "expo-sqlite";
import { localId } from "./namespace";

export interface JourneyAttempt {
  key: string;
  input: CreateJourney;
}
interface Row {
  attempt_key: string;
  input_json: string;
}

export const createJourneyAttemptTable = `CREATE TABLE journey_creation_attempt (
  slot INTEGER PRIMARY KEY CHECK (slot = 1),
  attempt_key TEXT NOT NULL,
  input_json TEXT NOT NULL
) STRICT;`;

function attemptFromRow(row: Row | null) {
  return row
    ? {
        key: localId(row.attempt_key),
        input: createJourney.parse(JSON.parse(row.input_json)),
      }
    : null;
}

export function journeyAttempts(
  db: Pick<SQLiteDatabase, "getFirstAsync" | "runAsync">,
) {
  return {
    async read() {
      return attemptFromRow(
        await db.getFirstAsync<Row>(
          "SELECT attempt_key, input_json FROM journey_creation_attempt WHERE slot = 1",
        ),
      );
    },
    async claim(attempt: JourneyAttempt) {
      const row = await db.getFirstAsync<Row>(
        `INSERT INTO journey_creation_attempt (slot, attempt_key, input_json) VALUES (1, ?, ?)
          ON CONFLICT (slot) DO UPDATE SET slot = excluded.slot
          RETURNING attempt_key, input_json`,
        localId(attempt.key),
        JSON.stringify(attempt.input),
      );
      const result = attemptFromRow(row);
      if (!result) throw new Error("The journey attempt could not be stored.");
      return result;
    },
    async clear(key: string) {
      await db.runAsync(
        "DELETE FROM journey_creation_attempt WHERE slot = 1 AND attempt_key = ?",
        localId(key),
      );
    },
  };
}
