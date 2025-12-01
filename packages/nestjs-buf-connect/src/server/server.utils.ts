import * as http from 'node:http';
import * as http2 from 'node:http2';
import * as https from 'node:https';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import type {
  Http2InsecureOptions,
  Http2Options,
  HttpOptions,
  HttpsOptions,
  Router,
} from '../connect.interfaces.js';

export function createHttpServer(
  { serverOptions, connectRouterOptions }: HttpOptions,
  routes: Router,
): http.Server {
  return http.createServer(
    serverOptions,
    connectNodeAdapter({ ...connectRouterOptions, routes }),
  );
}

export function createHttp2Server(
  options: Http2Options,
  routes: Router,
): http2.Http2Server {
  return http2.createSecureServer(
    options.serverOptions,
    connectNodeAdapter({
      ...options.connectRouterOptions,
      routes,
    }),
  );
}

export function createHttpsServer(
  options: HttpsOptions,
  routes: Router,
): https.Server {
  return https.createServer(
    options.serverOptions,
    connectNodeAdapter({
      ...options.connectRouterOptions,
      routes,
    }),
  );
}

export function createHttp2InsecureServer(
  options: Http2InsecureOptions,
  routes: Router,
): http2.Http2Server {
  return http2.createServer(
    options.serverOptions,
    connectNodeAdapter({
      ...options.connectRouterOptions,
      routes,
    }),
  );
}
