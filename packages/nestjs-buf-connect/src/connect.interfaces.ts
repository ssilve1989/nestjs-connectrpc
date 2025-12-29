import type {
  Server as HttpServer,
  ServerOptions as HttpServerOptions,
} from 'node:http';
import type {
  Http2SecureServer,
  SecureServerOptions as Http2SecureServerOptions,
  Http2Server,
  ServerOptions as Http2ServerOptions,
} from 'node:http2';
import type {
  Server as HttpsServer,
  ServerOptions as HttpsServerOptions,
} from 'node:https';
import type { ConnectRouter, ConnectRouterOptions } from '@connectrpc/connect';

export const ServerProtocol = {
  HTTP: 'http',
  HTTPS: 'https',
  HTTP2: 'http2',
  HTTP2_INSECURE: 'http2_insecure',
} as const;

/**
 * Streaming types for Connect RPC methods.
 * Extends NestJS GrpcMethodStreamingType to include bidirectional streaming.
 */
export const ConnectStreamingType = {
  /** Unary: single request, single response */
  NO_STREAMING: 'no_stream',
  /** Server streaming: single request, stream of responses */
  RX_STREAMING: 'rx_stream',
  /** Client streaming: stream of requests, single response */
  PT_STREAMING: 'pt_stream',
  /** Bidirectional streaming: stream of requests, stream of responses */
  DUPLEX_STREAMING: 'duplex_stream',
} as const;

export type ConnectStreamingType =
  (typeof ConnectStreamingType)[keyof typeof ConnectStreamingType];

export interface BaseServerOptions {
  port: number;
  connectRouterOptions: ConnectRouterOptions;
  callback?: () => void;
}

export interface HttpOptions extends BaseServerOptions {
  protocol: typeof ServerProtocol.HTTP;
  serverOptions: HttpServerOptions;
}

export interface Http2Options extends BaseServerOptions {
  protocol: typeof ServerProtocol.HTTP2;
  serverOptions: Http2SecureServerOptions;
}

export interface Http2InsecureOptions extends BaseServerOptions {
  protocol: typeof ServerProtocol.HTTP2_INSECURE;
  serverOptions: Http2ServerOptions;
}

export interface HttpsOptions extends BaseServerOptions {
  protocol: typeof ServerProtocol.HTTPS;
  serverOptions: HttpsServerOptions;
}

export type ConnectRpcServerOpts =
  | Http2InsecureOptions
  | Http2Options
  | HttpOptions
  | HttpsOptions;

export type ConnectRpcServerInstance =
  | HttpsServer
  | Http2SecureServer
  | Http2Server
  | HttpServer
  | null;

export type Router = (router: ConnectRouter) => void;

export interface ConnectRpcPattern {
  rpc: string;
  service: string;
  streaming: ConnectStreamingType;
}
