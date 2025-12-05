# Examples

This directory contains example applications demonstrating the `nestjs-buf-connect` library.

## Available Examples

| Example | Description |
|---------|-------------|
| [connect-example](./connect-example/) | NestJS server implementing `ExampleService` with all four RPC patterns |
| [connect-client](./connect-client/) | ConnectRPC client using `@connectrpc/connect` |
| [grpc-client](./grpc-client/) | Native gRPC client using `@grpc/grpc-js` |

## Quick Start

### 1. Install Dependencies

From the repository root:

```bash
pnpm install
```

### 2. Generate Protocol Buffer Code

```bash
pnpm generate
```

### 3. Start the Server

```bash
cd examples/connect-example
pnpm build
pnpm start
```

You should see:

```
╔═══════════════════════════════════════════════════════════════════╗
║                   Connect Example Server                          ║
╠═══════════════════════════════════════════════════════════════════╣
║  Server is running on port 50051                                 ║
║  ...                                                              ║
╚═══════════════════════════════════════════════════════════════════╝
```

### 4. Run a Client (in a separate terminal)

**Option A: ConnectRPC Client**

```bash
cd examples/connect-client
pnpm build
pnpm start
```

**Option B: gRPC-js Client**

```bash
cd examples/grpc-client
pnpm build
pnpm start
```

Both clients will exercise all four RPC patterns and display the results.

## RPC Patterns Demonstrated

The examples demonstrate all four gRPC/ConnectRPC streaming patterns:

1. **Unary (SayHello)**: Single request, single response
2. **Server Streaming (ServerStream)**: Single request, stream of responses
3. **Client Streaming (ClientStream)**: Stream of requests, single response
4. **Bidirectional Streaming (BidiStream)**: Concurrent streams in both directions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
├────────────────────────────┬────────────────────────────────────┤
│     connect-client         │         grpc-client                │
│  (@connectrpc/connect)     │       (@grpc/grpc-js)              │
│                            │                                    │
│  • Type-safe generated     │  • Dynamic proto loading           │
│  • Async iterators         │  • Callback/stream API             │
│  • Connect + gRPC protocols│  • gRPC protocol only              │
└────────────────────────────┴────────────────────────────────────┘
                              │
                              │ gRPC (HTTP/2)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     connect-example                              │
│                  (NestJS + nestjs-buf-connect)                   │
├─────────────────────────────────────────────────────────────────┤
│  ExampleService                                                  │
│    • SayHello (unary)                                            │
│    • ServerStream (server streaming)                             │
│    • ClientStream (client streaming)                             │
│    • BidiStream (bidirectional streaming)                        │
├─────────────────────────────────────────────────────────────────┤
│  Supported Protocols: Connect, gRPC, gRPC-web                    │
└─────────────────────────────────────────────────────────────────┘
```

## Expected Output

When you run either client, you should see output similar to:

```
============================================================
Testing Unary RPC: SayHello
============================================================
Sending: { name: "ConnectRPC Client" }
Received: { message: "Hello, ConnectRPC Client!", timestamp: 1234567890 }
Unary RPC completed successfully!

============================================================
Testing Server Streaming RPC: ServerStream
============================================================
Sending: { data: "Hello from client", count: 5 }
Receiving stream:
  [0] Hello from client (chunk 1 of 5)
  [1] Hello from client (chunk 2 of 5)
  [2] Hello from client (chunk 3 of 5)
  [3] Hello from client (chunk 4 of 5)
  [4] Hello from client (chunk 5 of 5)
Server streaming RPC completed successfully!

============================================================
Testing Client Streaming RPC: ClientStream
============================================================
Sending stream:
  Sending: { data: "apple" }
  Sending: { data: "banana" }
  Sending: { data: "cherry" }
  Sending: { data: "date" }
  Sending: { data: "elderberry" }
Received: { data: "Aggregated 5 items: apple, banana, cherry, date, elderberry", index: 5 }
Client streaming RPC completed successfully!

============================================================
Testing Bidirectional Streaming RPC: BidiStream
============================================================
Starting bidirectional stream:
  -> Sending: { data: "Hello" }
  <- Received: { data: "Echo: Hello", index: 0 }
  -> Sending: { data: "How are you?" }
  <- Received: { data: "Echo: How are you?", index: 1 }
  -> Sending: { data: "Goodbye" }
  <- Received: { data: "Echo: Goodbye", index: 2 }
Bidirectional streaming RPC completed successfully!

============================================================
All RPC tests completed successfully!
============================================================
```

## Testing with buf curl

You can also test the server using `buf curl`:

```bash
# Unary RPC
buf curl --protocol grpc --http2-prior-knowledge \
  --schema proto \
  http://localhost:50051/example.v1.ExampleService/SayHello \
  -d '{"name": "World"}'

# Server streaming
buf curl --protocol grpc --http2-prior-knowledge \
  --schema proto \
  http://localhost:50051/example.v1.ExampleService/ServerStream \
  -d '{"data": "test", "count": 3}'
```
