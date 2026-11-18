import { createTransport } from "nodemailer";

type Message = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function openMailTransport(smtpUrl: string) {
  const transport = createTransport(smtpUrl, {
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
