import 'reflect-metadata';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 50052;

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'example.v1',
        protoPath: resolve(__dirname, '../../../proto/example/v1/example.proto'),
        url: `0.0.0.0:${PORT}`,
      },
    },
  );

  await app.listen();

  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║              Standard NestJS gRPC Server (Benchmark)              ║
╠═══════════════════════════════════════════════════════════════════╣
║  Server is running on port ${PORT}                                 ║
║                                                                   ║
║  Transport: @grpc/grpc-js                                         ║
║  Protocol: gRPC (native)                                          ║
║                                                                   ║
║  Service: example.v1.ExampleService                               ║
║                                                                   ║
║  Methods:                                                         ║
║    • SayHello (unary)                                             ║
║    • ServerStream (server streaming)                              ║
║    • ClientStream (client streaming)                              ║
║    • BidiStream (bidirectional streaming)                         ║
╚═══════════════════════════════════════════════════════════════════╝
  `);
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
