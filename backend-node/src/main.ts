import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './bootstrap';

// BigInt JSON 序列化支持
Object.defineProperty(BigInt.prototype, 'toJSON', {
  configurable: true,
  writable: true,
  value: function (this: bigint): string {
    return this.toString();
  },
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApplication(app);

  const port = process.env.PORT || 30050;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
}
void bootstrap();
