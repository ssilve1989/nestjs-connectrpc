import type { ConnectRouter } from '@connectrpc/connect';
import {
  type CustomTransportStrategy,
  type MessageHandler,
  Server,
} from '@nestjs/microservices';
import type { BufConnectServerOpts, Router } from './connect.interfaces.js';
import { addServicesToRouter, createServiceHandlers } from './router/router.js';
import { BufConnectServer } from './server/server.js';

/**
 * NestJS custom transport strategy for Connect RPC.
 * Enables the use of ConnectRPC with NestJS's decorator-based routing approach.
 *
 * @example
 * ```typescript
 * const app = await NestFactory.createMicroservice(AppModule, {
 *   strategy: new BufConnectServerStrategy({
 *     protocol: 'http2_insecure',
 *     port: 50051,
 *     serverOptions: {},
 *     connectRouterOptions: {},
 *   }),
 * });
 * await app.listen();
 * ```
 */
class BufConnectServerStrategy
  extends Server
  implements CustomTransportStrategy
{
  #server: BufConnectServer | null = null;

  constructor(public readonly options: BufConnectServerOpts) {
    super();
  }

  /**
   * Subscribe to events from the server.
   * @param event The event name
   * @param callback The callback to invoke when the event is emitted
   */
  // biome-ignore lint/complexity/noBannedTypes: Required by NestJS Server interface
  on<EventKey extends string, EventCallback extends Function>(
    _event: EventKey,
    _callback: EventCallback,
  ): this {
    // ConnectRPC doesn't have a built-in event system
    // This is a no-op implementation to satisfy the abstract method
    return this;
  }

  /**
   * Returns the underlying server instance.
   * @returns The BufConnectServer instance or null if not started
   */
  unwrap<T>(): T {
    return this.#server as T;
  }

  /**
   * Starts the Connect RPC server.
   * This method is called after NestJS has registered all message handlers.
   * @param callback Called when the server starts or fails to start
   */
  async listen(
    callback: (error?: unknown, ...optionalParams: unknown[]) => void,
  ): Promise<void> {
    try {
      // Create router and server after all handlers are registered
      const router = this.createRouter();
      this.#server = new BufConnectServer(this.options, router);
      await this.#server.startServer();
      callback();
    } catch (e: unknown) {
      callback(e);
    }
  }

  /**
   * Gracefully closes the Connect RPC server.
   */
  async close(): Promise<void> {
    await this.#server?.close();
    this.#server = null;
  }

  /**
   * Adds a handler to the message handlers map
   * @param pattern The pattern associated with the handler
   * @param callback The handler function
   * @param isEventHandler Whether the handler is an event handler. Defaults to false
   */
  override addHandler(
    pattern: unknown,
    callback: MessageHandler,
    isEventHandler = false,
  ): void {
    const route =
      typeof pattern === 'string' ? pattern : JSON.stringify(pattern);

    const callbackToSet = isEventHandler
      ? Object.assign(callback, { isEventHandler: true })
      : callback;

    this.messageHandlers.set(route, callbackToSet);
  }

  /**
   * Creates the router function that registers service handlers with the ConnectRouter.
   */
  private createRouter(): Router {
    return (router: ConnectRouter) => {
      const serviceHandlers = createServiceHandlers(this.getHandlers());
      addServicesToRouter(router, serviceHandlers);
    };
  }
}

export { BufConnectServerStrategy };
