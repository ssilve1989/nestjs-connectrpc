// Strategy

// Constants
export {
  CONNECT_METHOD_METADATA,
  CONNECT_SERVICE_METADATA,
  CONNECT_TRANSPORT,
} from './connect.consts.js';

// Decorators
export {
  ConnectBidiStreaming,
  ConnectClientStreaming,
  ConnectMethod,
  type ConnectMethodOptions,
  ConnectServerStreaming,
  ConnectService,
} from './connect.decorators.js';

// Interfaces and Types
export {
  type BaseServerOptions,
  type ConnectRpcPattern,
  type ConnectRpcServerInstance,
  type ConnectRpcServerOpts,
  ConnectStreamingType,
  type Http2InsecureOptions,
  type Http2Options,
  type HttpOptions,
  type HttpsOptions,
  type Router,
  ServerProtocol,
} from './connect.interfaces.js';
export { ConnectRpcServerStrategy } from './connect.strategy.js';

// Store (for advanced usage)
export { metadataStore } from './store.js';
