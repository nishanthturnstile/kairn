import { createTransport } from "nodemailer";

type Message = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  messageId?: string;
};

export function openMailTransport(smtpUrl: string) {
  const connection = new URL(smtpUrl);
  connection.searchParams.set("connectionTimeout", "5000");
  connection.searchParams.set("greetingTimeout", "5000");
  connection.searchParams.set("socketTimeout", "10000");
  const transport = createTransport(connection.href, {
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  return {
    async send(message: Message) {
      const { messageId } = await transport.sendMail(message);
      return messageId;
    },
    close() {
      transport.close();
    },
  };
}
