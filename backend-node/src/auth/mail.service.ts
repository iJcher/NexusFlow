import { Injectable, OnModuleDestroy } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { AuthConfig } from './auth.config';

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(private readonly config: AuthConfig) {
    const host = config.required('SMTP_HOST');
    const port = config.integer('SMTP_PORT', 587, 1, 65535);
    const secure = config.env.get<string>('SMTP_SECURE') === 'true';
    const insecure = config.env.get<string>('SMTP_ALLOW_INSECURE') === 'true';
    if (insecure && config.production)
      throw new Error('Insecure SMTP is forbidden in production');
    this.from = config.required('SMTP_FROM');
    if (/[\r\n\0]/.test(this.from)) throw new Error('Invalid SMTP_FROM');
    const user = config.env.get<string>('SMTP_USER');
    const pass = config.env.get<string>('SMTP_PASSWORD');
    if (config.production && (!user || !pass))
      throw new Error('SMTP credentials are required');
    if (!!user !== !!pass) throw new Error('Incomplete SMTP credentials');
    const timeout = config.integer('SMTP_TIMEOUT_MS', 10000, 1000, 30000);
    this.transport = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !insecure && !secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout,
      dnsTimeout: timeout,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
  }

  async sendLoginCode(email: string, code: string): Promise<void> {
    const result = await this.transport.sendMail({
      from: this.from,
      to: { address: email, name: '' },
      subject: 'NexusFlow 登录验证码',
      text:
        '你的 NexusFlow 登录验证码是：' +
        code +
        '\n有效期 ' +
        Math.ceil(this.config.codeTtl / 60) +
        ' 分钟。请勿向他人透露。' +
        '\n如果不是你发起的请求，请忽略此邮件。',
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error('SMTP did not accept recipient');
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
