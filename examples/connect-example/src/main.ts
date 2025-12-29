import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { ConnectRpcServerStrategy, ServerProtocol } from 'nestjs-buf-connect';
import { AppModule } from './app.module.js';

const PORT = Number(process.env.PORT) || 50051;

async function bootstrap() {
  // Create a NestJS microservice using the Connect/gRPC strategy
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      strategy: new ConnectRpcServerStrategy({
        // Use HTTP/2 without TLS for development
        // In production, use HTTP2 with proper TLS certificates
        protocol: ServerProtocol.HTTP2_INSECURE,
        port: PORT,
        serverOptions: {},
        connectRouterOptions: {
          // All protocols enabled by default:
          // - Connect protocol (native ConnectRPC)
          // - gRPC protocol (compatible with grpc-js clients)
          // - gRPC-web protocol (for browser clients)
        },
      }),
    },
  );

  await app.listen();

  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                   Connect Example Server                          ║
╠═══════════════════════════════════════════════════════════════════╣
║  Server is running on port ${PORT}                                 ║
║                                                                   ║
║  Supported protocols:                                             ║
║    • Connect (native)                                             ║
║    • gRPC                                                         ║
║    • gRPC-web                                                     ║
║                                                                   ║
║  Service: example.v1.ExampleService                               ║
║                                                                   ║
║  Methods:                                                         ║
║    • SayHello (unary)                                             ║
║    • ServerStream (server streaming)                              ║
║    • ClientStream (client streaming)                              ║
║    • BidiStream (bidirectional streaming)                         ║
║                                                                   ║
║  Test with (from repo root):                                      ║
║    cd examples/connect-example && ./run.sh                        ║
║                                                                   ║
║  Or manually:                                                     ║
║    buf curl --protocol grpc --http2-prior-knowledge               ║
║      --schema ../../proto                                         ║
║      http://localhost:${PORT}/example.v1.ExampleService/SayHello   ║
║      -d '{"name": "World"}'                                       ║
╚═══════════════════════════════════════════════════════════════════╝
  `);
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
