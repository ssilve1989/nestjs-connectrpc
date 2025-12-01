import { create } from '@bufbuild/protobuf';
import { from, Observable } from 'rxjs';
import {
  ExampleService,
  type HelloRequest,
  HelloResponseSchema,
  type StreamRequest,
  StreamResponseSchema,
} from '../../src/gen/example/v1/example_pb.js';
import {
  ConnectBidiStreaming,
  ConnectClientStreaming,
  ConnectMethod,
  ConnectServerStreaming,
  ConnectService,
} from '../../src/index.js';

/**
 * Test controller demonstrating all four gRPC streaming types with NestJS decorators.
 */
@ConnectService(ExampleService)
export class TestController {
  /**
   * Unary RPC: single request, single response
   */
  @ConnectMethod()
  sayHello(request: HelloRequest) {
    return create(HelloResponseSchema, {
      message: `Hello, ${request.name}!`,
      timestamp: BigInt(Date.now()),
    });
  }

  /**
   * Server streaming RPC: single request, stream of responses
   * Returns an Observable that emits multiple responses
   */
  @ConnectServerStreaming()
  serverStream(request: StreamRequest): Observable<unknown> {
    const count = request.count || 3;
    const items = Array.from({ length: count }, (_, i) =>
      create(StreamResponseSchema, {
        data: `${request.data}-${i}`,
        index: i,
      }),
    );
    return from(items);
  }

  /**
   * Client streaming RPC: stream of requests, single response
   * Receives an AsyncIterable of requests and returns a single response
   */
  @ConnectClientStreaming()
  async clientStream(requests: AsyncIterable<StreamRequest>) {
    let totalCount = 0;
    const dataItems: string[] = [];

    for await (const request of requests) {
      totalCount++;
      dataItems.push(request.data);
    }

    return create(StreamResponseSchema, {
      data: dataItems.join(', '),
      index: totalCount,
    });
  }

  /**
   * Bidirectional streaming RPC: stream of requests, stream of responses
   * Receives an AsyncIterable and returns an Observable
   */
  @ConnectBidiStreaming()
  bidiStream(requests: AsyncIterable<StreamRequest>): Observable<unknown> {
    return new Observable((subscriber) => {
      (async () => {
        let index = 0;
        for await (const request of requests) {
          subscriber.next(
            create(StreamResponseSchema, {
              data: `Echo: ${request.data}`,
              index: index++,
            }),
          );
        }
        subscriber.complete();
      })().catch((err) => subscriber.error(err));
    });
  }
}
