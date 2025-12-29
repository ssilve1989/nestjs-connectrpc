import type {
  ConnectRpcServerInstance,
  ConnectRpcServerOpts,
  Router,
} from '../connect.interfaces.js';
import {
  createHttp2InsecureServer,
  createHttp2Server,
  createHttpServer,
  createHttpsServer,
} from './server.utils.js';

/**
 * Type guard to check if a server has the closeAllConnections method.
 * This method is available in Node.js 18.2+ for HTTP servers and in HTTP/2 servers.
 */
const hasCloseAllConnections = (
  server: ConnectRpcServerInstance,
): server is ConnectRpcServerInstance & { closeAllConnections: () => void } =>
  server !== null &&
  typeof (server as { closeAllConnections?: unknown }).closeAllConnections ===
    'function';

class ConnectRpcServer {
  #instance: ConnectRpcServerInstance;

  constructor(
    public readonly options: ConnectRpcServerOpts,
    public readonly router: Router,
  ) {
    this.#instance = this.createServerInstance();
  }

  public startServer(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.#instance?.listen(this.options.port, () => {
        this.options.callback?.();
        resolve();
      });
    });
  }

  public close(callback?: () => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.#instance === null) {
        callback?.();
        return resolve();
      }

      const server = this.#instance;

      // Close all connections first to prevent the server from waiting
      // indefinitely for active connections to close
      if (hasCloseAllConnections(server)) {
        server.closeAllConnections();
      }

      server.close((err) => {
        this.#instance = null;
        callback?.();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private createServerInstance(): ConnectRpcServerInstance {
    switch (this.options.protocol) {
      case 'http':
        return createHttpServer(this.options, this.router);
      case 'https':
        return createHttpsServer(this.options, this.router);
      case 'http2':
        return createHttp2Server(this.options, this.router);
      case 'http2_insecure':
        return createHttp2InsecureServer(this.options, this.router);
      default:
        throw new Error('Invalid protocol option');
    }
  }
}

export { ConnectRpcServer };
