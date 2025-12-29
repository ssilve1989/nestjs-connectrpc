import type { DescService } from '@bufbuild/protobuf';
import type { ConnectRouter, ServiceImpl } from '@connectrpc/connect';
import type { MessageHandler } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  type ConnectRpcPattern,
  ConnectStreamingType,
} from '../connect.interfaces.js';
import { metadataStore } from '../store.js';
import { toAsyncGenerator, transformToObservable } from '../utils/async.js';

/**
 * Handler function types for different RPC streaming modes
 */
type UnaryHandler = (request: unknown, context: unknown) => Promise<unknown>;
type ServerStreamHandler = (
  request: unknown,
  context: unknown,
) => AsyncGenerator<unknown>;
type ClientStreamHandler = (
  requests: AsyncIterable<unknown>,
  context: unknown,
) => Promise<unknown>;
type BidiStreamHandler = (
  requests: AsyncIterable<unknown>,
  context: unknown,
) => AsyncGenerator<unknown>;

type RpcHandler =
  | UnaryHandler
  | ServerStreamHandler
  | ClientStreamHandler
  | BidiStreamHandler;

/**
 * Map of service name -> method name -> handler
 */
type ServiceHandlerMap = Record<string, Record<string, RpcHandler>>;

/**
 * Creates a map of service handlers using the provided message handlers
 * The map is keyed by service names with values being method implementations
 * @param handlers
 */
export const createServiceHandlers = (
  handlers: Map<string, MessageHandler>,
): ServiceHandlerMap => {
  const serviceHandlers: ServiceHandlerMap = {};

  for (const [key, handler] of handlers) {
    const {
      streaming: streamingType,
      service,
      ...pattern
    } = JSON.parse(key) as ConnectRpcPattern;

    if (!handler) continue;

    if (!serviceHandlers[service]) {
      serviceHandlers[service] = {};
    }

    switch (streamingType) {
      case ConnectStreamingType.NO_STREAMING: {
        serviceHandlers[service][pattern.rpc] = async (
          request: unknown,
          context: unknown,
        ) => {
          const result = handler(request, context);
          const resultOrDeferred = await result;
          return lastValueFrom(transformToObservable(resultOrDeferred));
        };
        break;
      }

      case ConnectStreamingType.RX_STREAMING: {
        // Server streaming: single request, stream of responses
        serviceHandlers[service][pattern.rpc] =
          async function* serverStreamingHandler(
            request: unknown,
            context: unknown,
          ): AsyncGenerator<unknown> {
            const result = handler(request, context);
            const resultOrDeferred = await result;
            yield* toAsyncGenerator<unknown>(resultOrDeferred);
          };
        break;
      }

      case ConnectStreamingType.PT_STREAMING: {
        // Client streaming: stream of requests, single response
        serviceHandlers[service][pattern.rpc] = async (
          requests: AsyncIterable<unknown>,
          context: unknown,
        ) => {
          const result = handler(requests, context);
          const resultOrDeferred = await result;
          return lastValueFrom(transformToObservable(resultOrDeferred));
        };
        break;
      }

      case ConnectStreamingType.DUPLEX_STREAMING: {
        // Bidirectional streaming: stream of requests, stream of responses
        serviceHandlers[service][pattern.rpc] =
          async function* bidiStreamingHandler(
            requests: AsyncIterable<unknown>,
            context: unknown,
          ): AsyncGenerator<unknown> {
            const result = handler(requests, context);
            const resultOrDeferred = await result;
            yield* toAsyncGenerator<unknown>(resultOrDeferred);
          };
        break;
      }

      default:
        throw new Error(`Invalid streaming type: ${streamingType}`);
    }
  }

  return serviceHandlers;
};

/**
 * Adds services to the given ConnectRouter using the provided service handlers.
 * @param router The ConnectRouter to add services to
 * @param serviceHandlers an Object containing service handlers keyed by service name
 */
export const addServicesToRouter = (
  router: ConnectRouter,
  serviceHandlers: ServiceHandlerMap,
): void => {
  for (const serviceName of Object.keys(serviceHandlers)) {
    const service = metadataStore.get(serviceName);
    if (service) {
      // Cast through unknown as the handler map structure
      // matches what ConnectRouter.service expects at runtime
      router.service(
        service,
        serviceHandlers[serviceName] as unknown as Partial<
          ServiceImpl<DescService>
        >,
      );
    }
  }
};

export interface CreateConnectMethodMetadataOptions {
  target: object;
  key: string;
  service?: string;
  method?: string;
  streaming: ConnectStreamingType;
}

export const createConnectMethodMetadata = ({
  streaming = ConnectStreamingType.NO_STREAMING,
  target,
  service,
  key,
  method,
}: CreateConnectMethodMetadataOptions): ConnectRpcPattern => ({
  service: service ?? target.constructor.name,
  rpc: method ?? key,
  streaming,
});
