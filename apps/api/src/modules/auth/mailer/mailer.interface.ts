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

function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}

/**
 * Development mailer: prints links to the log. In production it NEVER logs the one-time
 * token nor the full e-mail (a token in Cloud Logging = account takeover); it only records
 * that delivery was skipped so the missing real provider is visible.
 */
@Injectable()
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger(ConsoleMailer.name);

  private emit(event: string, to: string, path: string, token: string): void {
    if (process.env['NODE_ENV'] === 'production') {
      this.logger.warn(
        JSON.stringify({
          event,
          to: maskEmail(to),
          delivered: false,
          reason: 'MAIL_DRIVER=console no envía correos en producción; configure un proveedor real.',
        }),
      );
      return;
    }
    const webUrl = process.env['WEB_URL'] ?? 'http://localhost:3000';
    this.logger.log(JSON.stringify({ event, to, link: `${webUrl}${path}?token=${token}` }));
  }

  async sendInvitation(params: { to: string; fullName: string; inviteToken: string }): Promise<void> {
    this.emit('mail.invite', params.to, '/accept-invite', params.inviteToken);
  }

  async sendPasswordReset(params: { to: string; fullName: string; resetToken: string }): Promise<void> {
    this.emit('mail.password_reset', params.to, '/reset-password', params.resetToken);
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
