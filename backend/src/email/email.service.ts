import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

// Envoltorio sobre Resend (HU-04). Si RESEND_API_KEY no está configurada
// (dev local sin cuenta de Resend), el link se imprime en consola en vez
// de fallar — así el flujo se puede probar de punta a punta sin depender
// de un proveedor externo.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.fromEmail =
      this.configService.get<string>('RESEND_FROM_EMAIL') || 'biocost@resend.dev';
  }

  async sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
    const subject = 'Recupera tu contraseña de Biocost';
    const html = `
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p><a href="${resetLink}">Haz clic aquí para elegir una nueva contraseña</a></p>
      <p>Este link es de un solo uso y expira en poco tiempo. Si no solicitaste esto, ignora este correo.</p>
    `;

    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY no configurada — link de recuperación para ${to}: ${resetLink}`,
      );
      return;
    }

    await this.resend.emails.send({
      from: this.fromEmail,
      to,
      subject,
      html,
    });
  }
}
