import { Injectable, Logger } from '@nestjs/common';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly token?: string;
}

export interface Mailer {
  sendInvitation(params: { to: string; fullName: string; inviteToken: string }): Promise<void>;
  sendPasswordReset(params: { to: string; fullName: string; resetToken: string }): Promise<void>;
}

export const MAILER_TOKEN = Symbol('MAILER_TOKEN');

@Injectable()
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger(ConsoleMailer.name);

  async sendInvitation(params: {
    to: string;
    fullName: string;
    inviteToken: string;
  }): Promise<void> {
    const webUrl = process.env['WEB_URL'] ?? 'http://localhost:3000';
    this.logger.log(
      JSON.stringify({
        event: 'mail.invite',
        to: params.to,
        link: `${webUrl}/accept-invite?token=${params.inviteToken}`,
      }),
    );
  }

  async sendPasswordReset(params: {
    to: string;
    fullName: string;
    resetToken: string;
  }): Promise<void> {
    const webUrl = process.env['WEB_URL'] ?? 'http://localhost:3000';
    this.logger.log(
      JSON.stringify({
        event: 'mail.password_reset',
        to: params.to,
        link: `${webUrl}/reset-password?token=${params.resetToken}`,
      }),
    );
  }
}

export class InMemoryMailer implements Mailer {
  public readonly sent: MailMessage[] = [];

  async sendInvitation(params: {
    to: string;
    fullName: string;
    inviteToken: string;
  }): Promise<void> {
    this.sent.push({
      to: params.to,
      subject: 'Invitación a Plataforma NOAH',
      text: `Hola ${params.fullName}, activa tu cuenta.`,
      token: params.inviteToken,
    });
  }

  async sendPasswordReset(params: {
    to: string;
    fullName: string;
    resetToken: string;
  }): Promise<void> {
    this.sent.push({
      to: params.to,
      subject: 'Recuperación de contraseña — Plataforma NOAH',
      text: `Hola ${params.fullName}, restablece tu contraseña.`,
      token: params.resetToken,
    });
  }
}
