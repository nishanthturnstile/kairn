import { expect } from "@playwright/test";

export const site = process.env.KAIRN_WEB_ORIGIN ?? "http://127.0.0.1:58080";
const inbox = process.env.KAIRN_TEST_MAILPIT_URL ?? "http://127.0.0.1:58025";

export async function mailLink(
  email: string,
  subject: string,
  path = "/api/auth/",
) {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const messages = await fetch(
          `${inbox}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        ).then((response) => response.json());
        id = messages.messages?.find(
          (message: { Subject: string }) => message.Subject === subject,
        )?.ID;
        return Boolean(id);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const mail = await fetch(`${inbox}/api/v1/message/${id}`).then((response) =>
    response.json(),
  );
  const link = String(mail.Text)
    .split(/\s+/)
    .find((part) => part.startsWith(`${site}${path}`));
  if (!link) throw new Error("Fixture email did not contain a local link.");
  return link;
}
