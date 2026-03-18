import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// BigInt JSON 序列化支持
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.PORT || 30050;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
}
bootstrap();
