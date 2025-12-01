import { create } from '@bufbuild/protobuf';
import {
  ConnectBidiStreaming,
  ConnectClientStreaming,
  ConnectMethod,
  ConnectServerStreaming,
  ConnectService,
} from 'nestjs-buf-connect';
import { from, Observable } from 'rxjs';
import {
  ExampleService,
  type HelloRequest,
  HelloResponseSchema,
  type StreamRequest,
  StreamResponseSchema,
} from '../gen/example/v1/example_pb.js';

/**
 * ExampleController implements the ExampleService using NestJS decorators.
 * This demonstrates all four gRPC/Connect streaming patterns.
 */
@ConnectService(ExampleService)
export class ExampleController {
  /**
   * Unary RPC: Receives a single request and returns a single response.
   * This is the simplest RPC pattern, similar to a REST endpoint.
   */
  @ConnectMethod()
  sayHello(request: HelloRequest) {
    console.log(`[Unary] Received: ${request.name}`);

    return create(HelloResponseSchema, {
      message: `Hello, ${request.name}!`,
      timestamp: BigInt(Date.now()),
    });
  }

  /**
   * Server Streaming: Receives a single request and returns multiple responses.
   * Useful for scenarios like:
   * - Real-time data feeds
   * - Large data transfers split into chunks
   * - Progress updates
   */
  @ConnectServerStreaming()
  serverStream(request: StreamRequest): Observable<unknown> {
    console.log(
      `[Server Stream] Received: data=${request.data}, count=${request.count}`,
    );

    const count = request.count || 5;
    const responses = Array.from({ length: count }, (_, i) =>
      create(StreamResponseSchema, {
        data: `${request.data} (chunk ${i + 1} of ${count})`,
        index: i,
      }),
    );

    return from(responses);
  }

  /**
   * Client Streaming: Receives multiple requests and returns a single response.
   * Useful for scenarios like:
   * - File uploads (sending chunks)
   * - Aggregating data from multiple sources
   * - Batch processing
   */
  @ConnectClientStreaming()
  async clientStream(requests: AsyncIterable<StreamRequest>): Promise<unknown> {
    console.log('[Client Stream] Started receiving...');

    const dataItems: string[] = [];
    let totalCount = 0;

    for await (const request of requests) {
      console.log(`[Client Stream] Received: ${request.data}`);
      dataItems.push(request.data);
      totalCount++;
    }

    console.log(`[Client Stream] Completed. Total: ${totalCount} items`);

    return create(StreamResponseSchema, {
      data: `Aggregated ${totalCount} items: ${dataItems.join(', ')}`,
      index: totalCount,
    });
  }

  /**
   * Bidirectional Streaming: Receives and sends multiple messages simultaneously.
   * Useful for scenarios like:
   * - Real-time chat applications
   * - Collaborative editing
   * - Interactive gaming
   */
  @ConnectBidiStreaming()
  bidiStream(requests: AsyncIterable<StreamRequest>): Observable<unknown> {
    console.log('[Bidi Stream] Started...');

    return new Observable((subscriber) => {
      (async () => {
        let index = 0;

        for await (const request of requests) {
          console.log(`[Bidi Stream] Received: ${request.data}`);

          // Echo back a response for each request
          subscriber.next(
            create(StreamResponseSchema, {
              data: `Echo: ${request.data}`,
              index: index++,
            }),
          );
        }

        console.log(`[Bidi Stream] Completed. Total: ${index} messages`);
        subscriber.complete();
      })().catch((err) => {
        console.error('[Bidi Stream] Error:', err);
        subscriber.error(err);
      });
    });
  }
}
