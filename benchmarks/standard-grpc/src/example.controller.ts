import { Controller } from '@nestjs/common';
import { GrpcMethod, GrpcStreamMethod } from '@nestjs/microservices';
import { Observable, Subject } from 'rxjs';

/**
 * Request/Response interfaces matching the proto definitions.
 * Using loose typing as specified - no protobufjs generation needed.
 */
interface HelloRequest {
  name: string;
}

interface HelloResponse {
  message: string;
  timestamp: string; // int64 comes as string in grpc-js
}

interface StreamRequest {
  data: string;
  count: number;
}

interface StreamResponse {
  data: string;
  index: number;
}

/**
 * ExampleController implements the ExampleService using standard NestJS gRPC decorators.
 * This serves as the baseline for benchmarking against ConnectRPC.
 */
@Controller()
export class ExampleController {
  /**
   * Unary RPC: Receives a single request and returns a single response.
   */
  @GrpcMethod('ExampleService', 'SayHello')
  sayHello(request: HelloRequest): HelloResponse {
    return {
      message: `Hello, ${request.name}!`,
      timestamp: Date.now().toString(),
    };
  }

  /**
   * Server Streaming: Receives a single request and returns multiple responses.
   */
  @GrpcStreamMethod('ExampleService', 'ServerStream')
  serverStream(request: StreamRequest): Observable<StreamResponse> {
    const subject = new Subject<StreamResponse>();

    const count = request.count || 5;

    // Emit responses asynchronously
    setImmediate(() => {
      for (let i = 0; i < count; i++) {
        subject.next({
          data: `${request.data} (chunk ${i + 1} of ${count})`,
          index: i,
        });
      }
      subject.complete();
    });

    return subject.asObservable();
  }

  /**
   * Client Streaming: Receives multiple requests and returns a single response.
   */
  @GrpcStreamMethod('ExampleService', 'ClientStream')
  clientStream(
    requests: Observable<StreamRequest>,
  ): Observable<StreamResponse> {
    const subject = new Subject<StreamResponse>();

    const dataItems: string[] = [];

    requests.subscribe({
      next: (request) => {
        dataItems.push(request.data);
      },
      complete: () => {
        subject.next({
          data: `Aggregated ${dataItems.length} items: ${dataItems.join(', ')}`,
          index: dataItems.length,
        });
        subject.complete();
      },
      error: (err) => {
        subject.error(err);
      },
    });

    return subject.asObservable();
  }

  /**
   * Bidirectional Streaming: Receives and sends multiple messages simultaneously.
   */
  @GrpcStreamMethod('ExampleService', 'BidiStream')
  bidiStream(requests: Observable<StreamRequest>): Observable<StreamResponse> {
    const subject = new Subject<StreamResponse>();

    let index = 0;

    requests.subscribe({
      next: (request) => {
        // Echo back a response for each request
        subject.next({
          data: `Echo: ${request.data}`,
          index: index++,
        });
      },
      complete: () => {
        subject.complete();
      },
      error: (err) => {
        subject.error(err);
      },
    });

    return subject.asObservable();
  }
}
