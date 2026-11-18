import { createTransport } from "nodemailer";

type Message = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  messageId?: string;
  idempotencyKey?: string;
};

export function openMailTransport(smtpUrl: string, requireTls = false) {
  const connection = new URL(smtpUrl);
  connection.searchParams.set("connectionTimeout", "5000");
  connection.searchParams.set("greetingTimeout", "5000");
  connection.searchParams.set("socketTimeout", "10000");
  if (requireTls) {
    connection.searchParams.delete("ignoreTLS");
    connection.searchParams.set("requireTLS", "true");
  }
  const transport = createTransport(connection.href, {
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  return {
    async send({ idempotencyKey, ...message }: Message) {
      const { messageId } = await transport.sendMail({
        ...message,
        headers: idempotencyKey
          ? { "Resend-Idempotency-Key": idempotencyKey }
          : undefined,
      });
      return messageId;
    },
    close() {
      transport.close();
    },
  };
}
