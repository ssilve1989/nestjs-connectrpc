import { create } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { Controller, type INestMicroservice } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Observable } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ConnectBidiStreaming,
  ConnectClientStreaming,
  ConnectMethod,
  ConnectRpcServerStrategy,
  ConnectServerStreaming,
  ConnectService,
  ServerProtocol,
} from '../../src/index.js';
import {
  ExampleService,
  HelloRequestSchema,
  StreamRequestSchema,
} from '../gen/example/v1/example_pb.js';

// Define Controller inline to avoid import issues and keep test self-contained
@Controller()
@ConnectService(ExampleService)
class IntegrationController {
  @ConnectMethod()
  async sayHello(request: any) {
    return {
      message: `Hello, ${request.name}!`,
    };
  }

  @ConnectServerStreaming()
  serverStream(request: any): Observable<any> {
    return new Observable((subscriber) => {
      subscriber.next({ data: `${request.data}-1`, index: 1 });
      subscriber.next({ data: `${request.data}-2`, index: 2 });
      subscriber.complete();
    });
  }

  @ConnectClientStreaming()
  async clientStream(requests: AsyncIterable<any>) {
    let count = 0;
    const items = [];
    for await (const req of requests) {
      count++;
      items.push(req.data);
    }
    return { data: items.join(','), index: count };
  }

  @ConnectBidiStreaming()
  async *bidiStream(requests: AsyncIterable<any>) {
    for await (const req of requests) {
      yield { data: `Echo: ${req.data}`, index: 1 };
    }
  }
}

describe('Integration: ConnectRpcServerStrategy', () => {
  let app: INestMicroservice;
  const port = 50052;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IntegrationController],
    }).compile();

    app = moduleRef.createNestMicroservice({
      strategy: new ConnectRpcServerStrategy({
        port,
        protocol: ServerProtocol.HTTP2_INSECURE,
        serverOptions: {},
        connectRouterOptions: {},
      }),
    });

    await app.listen();
  });

  afterAll(async () => {
    await app.close();
  });

  const transport = createGrpcTransport({
    baseUrl: `http://localhost:${port}`,
  });

  const client = createClient(ExampleService, transport);

  it('should handle unary requests', async () => {
    const response = await client.sayHello(
      create(HelloRequestSchema, { name: 'World' }),
    );
    expect(response.message).toBe('Hello, World!');
  });

  it('should handle server streaming', async () => {
    const responses = [];

    for await (const res of client.serverStream(
      create(StreamRequestSchema, { data: 'test' }),
    )) {
      responses.push(res);
    }

    expect(responses).toHaveLength(2);
    expect(responses[0].data).toBe('test-1');
    expect(responses[1].data).toBe('test-2');
  });

  it('should handle client streaming', async () => {
    async function* input() {
      yield create(StreamRequestSchema, { data: 'a' });
      yield create(StreamRequestSchema, { data: 'b' });
      yield create(StreamRequestSchema, { data: 'c' });
    }

    const response = await client.clientStream(input());
    expect(response.data).toBe('a,b,c');
    expect(response.index).toBe(3);
  });

  it('should handle bidi streaming', async () => {
    async function* input() {
      yield create(StreamRequestSchema, { data: 'ping' });
      yield create(StreamRequestSchema, { data: 'pong' });
    }

    const responses = [];
    for await (const res of client.bidiStream(input())) {
      responses.push(res);
    }

    expect(responses).toHaveLength(2);
    expect(responses[0].data).toBe('Echo: ping');
    expect(responses[1].data).toBe('Echo: pong');
  });
});
