import type { MessageHandler } from '@nestjs/microservices';
import { describe, expect, it, vi } from 'vitest';
import { ConnectRpcServerStrategy, ServerProtocol } from '../../src/index.js';

// Helper to create a properly typed mock handler
const createMockHandler = (): MessageHandler =>
  vi.fn().mockResolvedValue({}) as unknown as MessageHandler;

describe('ConnectRpcServerStrategy', () => {
  const defaultOptions = {
    protocol: ServerProtocol.HTTP2_INSECURE,
    port: 50051,
    serverOptions: {},
    connectRouterOptions: {},
  } as const;

  describe('constructor', () => {
    it('should create instance with options', () => {
      const strategy = new ConnectRpcServerStrategy(defaultOptions);

      expect(strategy).toBeDefined();
      expect(strategy.options).toEqual(defaultOptions);
    });

    it('should accept different protocol options', () => {
      const httpOptions = {
        ...defaultOptions,
        protocol: ServerProtocol.HTTP,
      } as const;

      const strategy = new ConnectRpcServerStrategy(httpOptions);

      expect(strategy.options.protocol).toBe(ServerProtocol.HTTP);
    });
  });

  describe('addHandler', () => {
    it('should add handler to message handlers map', () => {
      const strategy = new ConnectRpcServerStrategy(defaultOptions);
      const mockHandler = createMockHandler();
      const pattern = { service: 'Test', rpc: 'method' };

      strategy.addHandler(pattern, mockHandler);

      const handlers = strategy.getHandlers();
      expect(handlers.size).toBe(1);
      expect(handlers.get(JSON.stringify(pattern))).toBe(mockHandler);
    });

    it('should handle string patterns', () => {
      const strategy = new ConnectRpcServerStrategy(defaultOptions);
      const mockHandler = createMockHandler();
      const pattern = 'test-pattern';

      strategy.addHandler(pattern, mockHandler);

      const handlers = strategy.getHandlers();
      expect(handlers.get(pattern)).toBe(mockHandler);
    });

    it('should add multiple handlers', () => {
      const strategy = new ConnectRpcServerStrategy(defaultOptions);
      const handler1 = createMockHandler();
      const handler2 = createMockHandler();

      strategy.addHandler({ service: 'A', rpc: 'm1' }, handler1);
      strategy.addHandler({ service: 'B', rpc: 'm2' }, handler2);

      const handlers = strategy.getHandlers();
      expect(handlers.size).toBe(2);
    });

    it('should mark event handlers correctly', () => {
      const strategy = new ConnectRpcServerStrategy(defaultOptions);
      const mockHandler = createMockHandler();

      strategy.addHandler('event-pattern', mockHandler, true);

      const handlers = strategy.getHandlers();
      const handler = handlers.get('event-pattern');
      expect(handler).toBeDefined();
      expect((handler as { isEventHandler?: boolean }).isEventHandler).toBe(
        true,
      );
    });
  });

  describe('getHandlers', () => {
    it('should return empty map initially', () => {
      const strategy = new ConnectRpcServerStrategy(defaultOptions);

      const handlers = strategy.getHandlers();

      expect(handlers).toBeInstanceOf(Map);
      expect(handlers.size).toBe(0);
    });

    it('should return all registered handlers', () => {
      const strategy = new ConnectRpcServerStrategy(defaultOptions);
      const patterns = [
        { service: 'S1', rpc: 'm1' },
        { service: 'S2', rpc: 'm2' },
        { service: 'S3', rpc: 'm3' },
      ];

      for (const p of patterns) {
        strategy.addHandler(p, createMockHandler());
      }

      const handlers = strategy.getHandlers();
      expect(handlers.size).toBe(3);
    });
  });
});
