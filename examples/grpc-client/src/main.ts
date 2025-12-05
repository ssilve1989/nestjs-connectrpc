import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_ADDRESS = process.env.SERVER_ADDRESS || 'localhost:50051';
const PROTO_PATH = join(__dirname, '../../../proto/example/v1/example.proto');

// Type definitions for the service
interface HelloRequest {
  name: string;
}

interface HelloResponse {
  message: string;
  timestamp: string; // bigint comes as string in grpc-js
}

interface StreamRequest {
  data: string;
  count: number;
}

interface StreamResponse {
  data: string;
  index: number;
}

type ExampleServiceClient = grpc.Client & {
  sayHello: (
    request: HelloRequest,
    callback: (
      error: grpc.ServiceError | null,
      response: HelloResponse,
    ) => void,
  ) => grpc.ClientUnaryCall;
  serverStream: (
    request: StreamRequest,
  ) => grpc.ClientReadableStream<StreamResponse>;
  clientStream: (
    callback: (
      error: grpc.ServiceError | null,
      response: StreamResponse,
    ) => void,
  ) => grpc.ClientWritableStream<StreamRequest>;
  bidiStream: () => grpc.ClientDuplexStream<StreamRequest, StreamResponse>;
};

/**
 * Loads the proto file and creates a gRPC client.
 */
async function createClient(): Promise<ExampleServiceClient> {
  const packageDefinition = await protoLoader.load(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
  const examplePackage = protoDescriptor.example as {
    v1: { ExampleService: grpc.ServiceClientConstructor };
  };

  const ExampleServiceClient = examplePackage.v1.ExampleService;

  return new ExampleServiceClient(
    SERVER_ADDRESS,
    grpc.credentials.createInsecure(),
  ) as unknown as ExampleServiceClient;
}

/**
 * Demonstrates the unary SayHello RPC.
 * Sends a single request and receives a single response.
 */
function testUnary(client: ExampleServiceClient): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('\n' + '='.repeat(60));
    console.log('Testing Unary RPC: SayHello');
    console.log('='.repeat(60));

    const request: HelloRequest = { name: 'gRPC-js Client' };
    console.log(`Sending: { name: "${request.name}" }`);

    client.sayHello(request, (error, response) => {
      if (error) {
        console.error('Error:', error.message);
        reject(error);
        return;
      }

      console.log(
        `Received: { message: "${response.message}", timestamp: ${response.timestamp} }`,
      );
      console.log('Unary RPC completed successfully!');
      resolve();
    });
  });
}

/**
 * Demonstrates the ServerStream RPC.
 * Sends a single request and receives a stream of responses.
 */
function testServerStream(client: ExampleServiceClient): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('\n' + '='.repeat(60));
    console.log('Testing Server Streaming RPC: ServerStream');
    console.log('='.repeat(60));

    const request: StreamRequest = {
      data: 'Hello from client',
      count: 5,
    };
    console.log(
      `Sending: { data: "${request.data}", count: ${request.count} }`,
    );

    const stream = client.serverStream(request);

    console.log('Receiving stream:');
    stream.on('data', (response: StreamResponse) => {
      console.log(`  [${response.index}] ${response.data}`);
    });

    stream.on('end', () => {
      console.log('Server streaming RPC completed successfully!');
      resolve();
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error.message);
      reject(error);
    });
  });
}

/**
 * Demonstrates the ClientStream RPC.
 * Sends a stream of requests and receives a single response.
 */
function testClientStream(client: ExampleServiceClient): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('\n' + '='.repeat(60));
    console.log('Testing Client Streaming RPC: ClientStream');
    console.log('='.repeat(60));

    console.log('Sending stream:');

    const stream = client.clientStream((error, response) => {
      if (error) {
        console.error('Error:', error.message);
        reject(error);
        return;
      }

      console.log(
        `Received: { data: "${response.data}", index: ${response.index} }`,
      );
      console.log('Client streaming RPC completed successfully!');
      resolve();
    });

    const items = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
    for (const item of items) {
      const request: StreamRequest = { data: item, count: 1 };
      console.log(`  Sending: { data: "${request.data}" }`);
      stream.write(request);
    }

    stream.end();
  });
}

/**
 * Demonstrates the BidiStream RPC.
 * Sends and receives streams of messages simultaneously.
 */
function testBidiStream(client: ExampleServiceClient): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('\n' + '='.repeat(60));
    console.log('Testing Bidirectional Streaming RPC: BidiStream');
    console.log('='.repeat(60));

    console.log('Starting bidirectional stream:');

    const stream = client.bidiStream();

    stream.on('data', (response: StreamResponse) => {
      console.log(
        `  <- Received: { data: "${response.data}", index: ${response.index} }`,
      );
    });

    stream.on('end', () => {
      console.log('Bidirectional streaming RPC completed successfully!');
      resolve();
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error.message);
      reject(error);
    });

    const messages = ['Hello', 'How are you?', 'Goodbye'];
    let index = 0;

    const sendNext = () => {
      if (index < messages.length) {
        const request: StreamRequest = { data: messages[index], count: 1 };
        console.log(`  -> Sending: { data: "${request.data}" }`);
        stream.write(request);
        index++;
        // Small delay to see the interleaved behavior
        setTimeout(sendNext, 100);
      } else {
        stream.end();
      }
    };

    sendNext();
  });
}

/**
 * Main entry point - runs all RPC examples.
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                     gRPC-js Client Example                        ║
╠═══════════════════════════════════════════════════════════════════╣
║  Connecting to: ${SERVER_ADDRESS.padEnd(47)}║
║                                                                   ║
║  This client demonstrates all four RPC patterns:                  ║
║    • Unary (SayHello)                                             ║
║    • Server Streaming (ServerStream)                              ║
║    • Client Streaming (ClientStream)                              ║
║    • Bidirectional Streaming (BidiStream)                         ║
╚═══════════════════════════════════════════════════════════════════╝
  `);

  const client = await createClient();

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
  } finally {
    client.close();
  }
}

main();
