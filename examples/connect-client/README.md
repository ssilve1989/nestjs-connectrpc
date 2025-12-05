# ConnectRPC Client Example

This example demonstrates how to use the ConnectRPC client (`@connectrpc/connect`) to connect to a gRPC/Connect server and exercise all four RPC patterns.

## Prerequisites

- The example server must be running on `localhost:50051` (or set `SERVER_URL` environment variable)
- Node.js 18+

## Running the Server

First, start the example server:

```bash
cd ../connect-example
pnpm install
pnpm build
pnpm start
```

## Running the Client

From this directory:

```bash
# Install dependencies
pnpm install

# Run the client (development mode with tsx)
pnpm start:dev

# Or build and run
pnpm build
pnpm start
```

## Configuration

Set the `SERVER_URL` environment variable to connect to a different server:

```bash
SERVER_URL=http://localhost:9000 pnpm start:dev
```

## RPC Patterns Demonstrated

1. **Unary RPC (SayHello)**: Single request, single response
2. **Server Streaming (ServerStream)**: Single request, stream of responses
3. **Client Streaming (ClientStream)**: Stream of requests, single response
4. **Bidirectional Streaming (BidiStream)**: Stream of requests and responses

## Key Dependencies

- `@connectrpc/connect` - ConnectRPC client library
- `@connectrpc/connect-node` - Node.js transport (HTTP/2 support)
- `@bufbuild/protobuf` - Protocol Buffers runtime

## Code Generation

The TypeScript types are generated using `buf generate` from the proto files. Run from the repository root:

```bash
pnpm generate
```
