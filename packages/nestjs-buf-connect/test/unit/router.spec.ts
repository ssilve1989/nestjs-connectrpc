import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectStreamingType } from '../../src/connect.interfaces.js';
import {
  addServicesToRouter,
  createConnectMethodMetadata,
  createServiceHandlers,
} from '../../src/router/router.js';
import { metadataStore } from '../../src/store.js';

describe('Router', () => {
  beforeEach(() => {
    metadataStore.clear();
  });

  describe('createServiceHandlers', () => {
    it('should create handlers map from message handlers', () => {
      const mockHandler = vi.fn().mockResolvedValue({ message: 'test' });
      const handlers = new Map<string, typeof mockHandler>();

      const pattern = JSON.stringify({
        service: 'TestService',
        rpc: 'sayHello',
        streaming: ConnectStreamingType.NO_STREAMING,
      });

      handlers.set(pattern, mockHandler);

      const result = createServiceHandlers(handlers);

      expect(result).toHaveProperty('TestService');
      expect(result.TestService).toHaveProperty('sayHello');
      expect(typeof result.TestService.sayHello).toBe('function');
    });

    it('should handle multiple services', () => {
      const handler1 = vi.fn().mockResolvedValue({ result: 1 });
      const handler2 = vi.fn().mockResolvedValue({ result: 2 });
      const handlers = new Map();

      handlers.set(
        JSON.stringify({
          service: 'ServiceA',
          rpc: 'methodA',
          streaming: ConnectStreamingType.NO_STREAMING,
        }),
        handler1,
      );

      handlers.set(
        JSON.stringify({
          service: 'ServiceB',
          rpc: 'methodB',
          streaming: ConnectStreamingType.NO_STREAMING,
        }),
        handler2,
      );

      const result = createServiceHandlers(handlers);

      expect(result).toHaveProperty('ServiceA');
      expect(result).toHaveProperty('ServiceB');
      expect(result.ServiceA).toHaveProperty('methodA');
      expect(result.ServiceB).toHaveProperty('methodB');
    });

    it('should handle multiple methods in same service', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handlers = new Map();

      handlers.set(
        JSON.stringify({
          service: 'TestService',
          rpc: 'method1',
          streaming: ConnectStreamingType.NO_STREAMING,
        }),
        handler1,
      );

      handlers.set(
        JSON.stringify({
          service: 'TestService',
          rpc: 'method2',
          streaming: ConnectStreamingType.NO_STREAMING,
        }),
        handler2,
      );

      const result = createServiceHandlers(handlers);

      expect(result.TestService).toHaveProperty('method1');
      expect(result.TestService).toHaveProperty('method2');
    });

    it('should skip null handlers', () => {
      const handlers = new Map();

      handlers.set(
        JSON.stringify({
          service: 'TestService',
          rpc: 'nullMethod',
          streaming: ConnectStreamingType.NO_STREAMING,
        }),
        null,
      );

      const result = createServiceHandlers(handlers);

      expect(result.TestService).toBeUndefined();
    });

    it('should create async function for unary streaming type', async () => {
      const mockResponse = { data: 'response' };
      const mockHandler = vi.fn().mockResolvedValue(mockResponse);
      const handlers = new Map();

      handlers.set(
        JSON.stringify({
          service: 'TestService',
          rpc: 'unaryMethod',
          streaming: ConnectStreamingType.NO_STREAMING,
        }),
        mockHandler,
      );

      const result = createServiceHandlers(handlers);
      const handler = result.TestService.unaryMethod as (
        req: unknown,
        ctx: unknown,
      ) => Promise<unknown>;

      const response = await handler({ input: 'test' }, {});

      expect(mockHandler).toHaveBeenCalledWith({ input: 'test' }, {});
      expect(response).toEqual(mockResponse);
    });

    it('should create handler for server streaming type', () => {
      const mockHandler = vi.fn();
      const handlers = new Map();

      handlers.set(
        JSON.stringify({
          service: 'TestService',
          rpc: 'streamMethod',
          streaming: ConnectStreamingType.RX_STREAMING,
        }),
        mockHandler,
      );

      const result = createServiceHandlers(handlers);

      // Just verify the handler is created as a function
      expect(typeof result.TestService.streamMethod).toBe('function');
    });

    it('should create handler for client streaming type', () => {
      const mockHandler = vi.fn();
      const handlers = new Map();

      handlers.set(
        JSON.stringify({
          service: 'TestService',
          rpc: 'clientStreamMethod',
          streaming: ConnectStreamingType.PT_STREAMING,
        }),
        mockHandler,
      );

      const result = createServiceHandlers(handlers);

      expect(typeof result.TestService.clientStreamMethod).toBe('function');
    });

    it('should create handler for bidi streaming type', () => {
      const mockHandler = vi.fn();
      const handlers = new Map();

      handlers.set(
        JSON.stringify({
          service: 'TestService',
          rpc: 'bidiMethod',
          streaming: ConnectStreamingType.DUPLEX_STREAMING,
        }),
        mockHandler,
      );

      const result = createServiceHandlers(handlers);

      expect(typeof result.TestService.bidiMethod).toBe('function');
    });
  });

  describe('addServicesToRouter', () => {
    it('should register services from metadata store', () => {
      const mockRouter = {
        service: vi.fn().mockReturnThis(),
      };

      const mockService = { typeName: 'test.v1.TestService' };
      metadataStore.set('TestController', mockService as never);

      const serviceHandlers = {
        TestController: { sayHello: vi.fn() },
      };

      addServicesToRouter(mockRouter as never, serviceHandlers);

      expect(mockRouter.service).toHaveBeenCalledWith(
        mockService,
        serviceHandlers.TestController,
      );
    });

    it('should skip services not in metadata store', () => {
      const mockRouter = {
        service: vi.fn().mockReturnThis(),
      };

      const serviceHandlers = {
        UnknownService: { method: vi.fn() },
      };

      addServicesToRouter(mockRouter as never, serviceHandlers);

      expect(mockRouter.service).not.toHaveBeenCalled();
    });

    it('should register multiple services', () => {
      const mockRouter = {
        service: vi.fn().mockReturnThis(),
      };

      const serviceA = { typeName: 'test.v1.ServiceA' };
      const serviceB = { typeName: 'test.v1.ServiceB' };
      metadataStore.set('ControllerA', serviceA as never);
      metadataStore.set('ControllerB', serviceB as never);

      const serviceHandlers = {
        ControllerA: { methodA: vi.fn() },
        ControllerB: { methodB: vi.fn() },
      };

      addServicesToRouter(mockRouter as never, serviceHandlers);

      expect(mockRouter.service).toHaveBeenCalledTimes(2);
    });
  });

  describe('createConnectMethodMetadata', () => {
    it('should create metadata with defaults from target', () => {
      const target = { constructor: { name: 'TestController' } };

      const result = createConnectMethodMetadata({
        target,
        key: 'sayHello',
        streaming: ConnectStreamingType.NO_STREAMING,
      });

      expect(result).toEqual({
        service: 'TestController',
        rpc: 'sayHello',
        streaming: ConnectStreamingType.NO_STREAMING,
      });
    });

    it('should use provided service name', () => {
      const target = { constructor: { name: 'TestController' } };

      const result = createConnectMethodMetadata({
        target,
        key: 'sayHello',
        service: 'CustomService',
        streaming: ConnectStreamingType.NO_STREAMING,
      });

      expect(result.service).toBe('CustomService');
    });

    it('should use provided method name', () => {
      const target = { constructor: { name: 'TestController' } };

      const result = createConnectMethodMetadata({
        target,
        key: 'sayHello',
        method: 'customMethod',
        streaming: ConnectStreamingType.NO_STREAMING,
      });

      expect(result.rpc).toBe('customMethod');
    });

    it('should use specified streaming type', () => {
      const target = { constructor: { name: 'TestController' } };

      const result = createConnectMethodMetadata({
        target,
        key: 'streamMethod',
        streaming: ConnectStreamingType.RX_STREAMING,
      });

      expect(result.streaming).toBe(ConnectStreamingType.RX_STREAMING);
    });
  });
});
