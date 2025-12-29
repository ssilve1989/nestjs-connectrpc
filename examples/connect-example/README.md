# Connect Example

This example demonstrates how to use `nestjs-buf-connect` to create a NestJS microservice with ConnectRPC/gRPC support.

## Features

- All 4 gRPC streaming patterns:
  - **Unary**: Single request, single response
  - **Server Streaming**: Single request, stream of responses
  - **Client Streaming**: Stream of requests, single response
  - **Bidirectional Streaming**: Stream of requests, stream of responses
- Multi-protocol support (Connect, gRPC, gRPC-web)
- Type-safe protobuf messages with `@bufbuild/protobuf`

## Prerequisites

- Node.js 18+
- pnpm

## Getting Started

### 1. Install dependencies (from repo root)

```bash
pnpm install
```

### 2. Generate TypeScript from protobuf (from repo root)

```bash
pnpm generate
```

### 3. Build the library and example

```bash
cd packages/nestjs-buf-connect && pnpm build
cd ../../examples/connect-example && pnpm build
```

### 4. Start the server

```bash
pnpm start
```

The server will start on port 50051 by default.

## Testing the Service

### Using the included run script

```bash
./run.sh
```

### Using buf curl

Test the unary endpoint (run from `examples/connect-example` directory):

```bash
buf curl --protocol grpc --http2-prior-knowledge \
  --schema ../../proto \
  http://localhost:50051/example.v1.ExampleService/SayHello \
  -d '{"name": "World"}'
```

Test server streaming:

```bash
buf curl --protocol grpc --http2-prior-knowledge \
  --schema ../../proto \
  http://localhost:50051/example.v1.ExampleService/ServerStream \
  -d '{"data": "Hello", "count": 3}'
```

### Using a Connect client (TypeScript)

```typescript
import { createClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { ExampleService } from './gen/example/v1/example_pb.js';

const transport = createGrpcTransport({
  baseUrl: 'http://localhost:50051',
  httpVersion: '2',
});

const client = createClient(ExampleService, transport);

// Unary call
const response = await client.sayHello({ name: 'World' });
console.log(response.message);

// Server streaming
for await (const msg of client.serverStream({ data: 'Hello', count: 3 })) {
  console.log(msg.data);
}
```

## Project Structure

```
connect-example/
├── src/
│   ├── gen/                        # Generated TypeScript (from root proto)
│   ├── example/
│   │   ├── example.controller.ts   # Service implementation
│   │   └── example.module.ts       # NestJS module
│   ├── app.module.ts               # Root module
│   └── main.ts                     # Application entry point
└── package.json

# Proto definitions are at repo root:
../../proto/
└── example/v1/example.proto
```

## Configuration

### Server Protocol

The server supports multiple protocols. Configure in `main.ts`:

```typescript
new ConnectRpcServerStrategy({
  protocol: ServerProtocol.HTTP2_INSECURE, // Development
  // protocol: ServerProtocol.HTTP2,       // Production with TLS
  port: 50051,
  serverOptions: {
    // For HTTP2 with TLS, provide cert and key
    // cert: fs.readFileSync('server.crt'),
    // key: fs.readFileSync('server.key'),
  },
  connectRouterOptions: {
    // Optionally disable specific protocols
    // grpc: false,
    // grpcWeb: false,
    // connect: false,
  },
});
```

### Environment Variables

- `PORT`: Server port (default: 50051)

## License

UNLICENSED
