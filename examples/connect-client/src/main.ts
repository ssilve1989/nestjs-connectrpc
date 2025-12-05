import { create } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import {
  ExampleService,
  HelloRequestSchema,
  StreamRequestSchema,
} from './gen/example/v1/example_pb.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:50051';

/**
 * Creates a gRPC transport for connecting to the server.
 * Uses HTTP/2 with the gRPC protocol.
 */
function createTransport() {
  return createGrpcTransport({
    baseUrl: SERVER_URL,
  });
}

/**
 * Demonstrates the unary SayHello RPC.
 * Sends a single request and receives a single response.
 */
async function testUnary(
  client: ReturnType<typeof createClient<typeof ExampleService>>,
) {
  console.log('\n' + '='.repeat(60));
  console.log('Testing Unary RPC: SayHello');
  console.log('='.repeat(60));

  const request = create(HelloRequestSchema, { name: 'ConnectRPC Client' });
  console.log(`Sending: { name: "${request.name}" }`);

  const response = await client.sayHello(request);

  console.log(
    `Received: { message: "${response.message}", timestamp: ${response.timestamp} }`,
  );
  console.log('Unary RPC completed successfully!');
}

/**
 * Demonstrates the ServerStream RPC.
 * Sends a single request and receives a stream of responses.
 */
async function testServerStream(
  client: ReturnType<typeof createClient<typeof ExampleService>>,
) {
  console.log('\n' + '='.repeat(60));
  console.log('Testing Server Streaming RPC: ServerStream');
  console.log('='.repeat(60));

  const request = create(StreamRequestSchema, {
    data: 'Hello from client',
    count: 5,
  });
  console.log(`Sending: { data: "${request.data}", count: ${request.count} }`);

  console.log('Receiving stream:');
  for await (const response of client.serverStream(request)) {
    console.log(`  [${response.index}] ${response.data}`);
  }

  console.log('Server streaming RPC completed successfully!');
}

/**
 * Demonstrates the ClientStream RPC.
 * Sends a stream of requests and receives a single response.
 */
async function testClientStream(
  client: ReturnType<typeof createClient<typeof ExampleService>>,
) {
  console.log('\n' + '='.repeat(60));
  console.log('Testing Client Streaming RPC: ClientStream');
  console.log('='.repeat(60));

  // Create an async generator to send multiple requests
  async function* generateRequests() {
    const items = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
    for (const item of items) {
      const request = create(StreamRequestSchema, {
        data: item,
        count: 1,
      });
      console.log(`  Sending: { data: "${request.data}" }`);
      yield request;
    }
  }

  console.log('Sending stream:');
  const response = await client.clientStream(generateRequests());

  console.log(
    `Received: { data: "${response.data}", index: ${response.index} }`,
  );
  console.log('Client streaming RPC completed successfully!');
}

/**
 * Demonstrates the BidiStream RPC.
 * Sends and receives streams of messages simultaneously.
 */
async function testBidiStream(
  client: ReturnType<typeof createClient<typeof ExampleService>>,
) {
  console.log('\n' + '='.repeat(60));
  console.log('Testing Bidirectional Streaming RPC: BidiStream');
  console.log('='.repeat(60));

  // Create an async generator to send multiple requests
  async function* generateRequests() {
    const messages = ['Hello', 'How are you?', 'Goodbye'];
    for (const msg of messages) {
      const request = create(StreamRequestSchema, {
        data: msg,
        count: 1,
      });
      console.log(`  -> Sending: { data: "${request.data}" }`);
      yield request;
      // Small delay to see the interleaved behavior
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log('Starting bidirectional stream:');
  for await (const response of client.bidiStream(generateRequests())) {
    console.log(
      `  <- Received: { data: "${response.data}", index: ${response.index} }`,
    );
  }

  console.log('Bidirectional streaming RPC completed successfully!');
}

/**
 * Main entry point - runs all RPC examples.
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                   ConnectRPC Client Example                       ║
╠═══════════════════════════════════════════════════════════════════╣
║  Connecting to: ${SERVER_URL.padEnd(47)}║
║                                                                   ║
║  This client demonstrates all four RPC patterns:                  ║
║    • Unary (SayHello)                                             ║
║    • Server Streaming (ServerStream)                              ║
║    • Client Streaming (ClientStream)                              ║
║    • Bidirectional Streaming (BidiStream)                         ║
╚═══════════════════════════════════════════════════════════════════╝
  `);

  const transport = createTransport();
  const client = createClient(ExampleService, transport);

  try {
    await testUnary(client);
    await testServerStream(client);
    await testClientStream(client);
    await testBidiStream(client);

    console.log('\n' + '='.repeat(60));
    console.log('All RPC tests completed successfully!');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('\nError:', error);
    process.exit(1);
  }
}

main();
