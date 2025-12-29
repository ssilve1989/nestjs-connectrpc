import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ConnectBidiStreaming,
  ConnectClientStreaming,
  ConnectMethod,
  ConnectServerStreaming,
  ConnectService,
} from '../../src/connect.decorators.js';
import { ConnectStreamingType } from '../../src/connect.interfaces.js';
import { metadataStore } from '../../src/store.js';

// Mock service descriptor
const mockServiceDescriptor = {
  typeName: 'test.v1.TestService',
  methods: {},
} as never;

describe('Decorators', () => {
  beforeEach(() => {
    metadataStore.clear();
  });

  describe('ConnectService', () => {
    it('should register service in metadata store', () => {
      @ConnectService(mockServiceDescriptor)
      // biome-ignore lint/correctness/noUnusedVariables: asserted via metadataStore
      class TestController {}

      expect(metadataStore.get('TestController')).toBe(mockServiceDescriptor);
    });

    it('should work with different service names', () => {
      const service1 = { typeName: 'test.v1.Service1' } as never;
      const service2 = { typeName: 'test.v1.Service2' } as never;

      @ConnectService(service1)
      // biome-ignore lint/correctness/noUnusedVariables: asserted via metadataStore
      class Controller1 {}

      @ConnectService(service2)
      // biome-ignore lint/correctness/noUnusedVariables: asserted via metadataStore
      class Controller2 {}

      expect(metadataStore.get('Controller1')).toBe(service1);
      expect(metadataStore.get('Controller2')).toBe(service2);
    });
  });

  describe('ConnectMethod', () => {
    it('should add message pattern metadata', () => {
      class TestController {
        @ConnectMethod()
        sayHello() {
          return { message: 'hello' };
        }
      }

      const metadata = Reflect.getMetadata(
        'microservices:pattern',
        TestController.prototype.sayHello,
      );

      expect(metadata).toBeDefined();
      expect(metadata).toContainEqual({
        service: 'TestController',
        rpc: 'sayHello',
        streaming: ConnectStreamingType.NO_STREAMING,
      });
    });

    it('should allow method name override', () => {
      class TestController {
        @ConnectMethod({ method: 'customName' })
        sayHello() {
          return { message: 'hello' };
        }
      }

      const metadata = Reflect.getMetadata(
        'microservices:pattern',
        TestController.prototype.sayHello,
      );

      expect(metadata).toContainEqual(
        expect.objectContaining({ rpc: 'customName' }),
      );
    });

    it('should allow service name override', () => {
      class TestController {
        @ConnectMethod({ service: 'CustomService' })
        sayHello() {
          return { message: 'hello' };
        }
      }

      const metadata = Reflect.getMetadata(
        'microservices:pattern',
        TestController.prototype.sayHello,
      );

      expect(metadata).toContainEqual(
        expect.objectContaining({ service: 'CustomService' }),
      );
    });
  });

  describe('ConnectServerStreaming', () => {
    it('should set RX_STREAMING type', () => {
      class TestController {
        @ConnectServerStreaming()
        *streamData() {
          yield { data: 1 };
        }
      }

      const metadata = Reflect.getMetadata(
        'microservices:pattern',
        TestController.prototype.streamData,
      );

      expect(metadata).toContainEqual(
        expect.objectContaining({
          streaming: ConnectStreamingType.RX_STREAMING,
        }),
      );
    });
  });

  describe('ConnectClientStreaming', () => {
    it('should set PT_STREAMING type', () => {
      class TestController {
        @ConnectClientStreaming()
        async collectData(_requests: AsyncIterable<unknown>) {
          return { total: 0 };
        }
      }

      const metadata = Reflect.getMetadata(
        'microservices:pattern',
        TestController.prototype.collectData,
      );

      expect(metadata).toContainEqual(
        expect.objectContaining({
          streaming: ConnectStreamingType.PT_STREAMING,
        }),
      );
    });
  });

  describe('ConnectBidiStreaming', () => {
    it('should set DUPLEX_STREAMING type', () => {
      class TestController {
        @ConnectBidiStreaming()
        async *chat(_requests: AsyncIterable<unknown>) {
          yield { reply: 'hello' };
        }
      }

      const metadata = Reflect.getMetadata(
        'microservices:pattern',
        TestController.prototype.chat,
      );

      expect(metadata).toContainEqual(
        expect.objectContaining({
          streaming: ConnectStreamingType.DUPLEX_STREAMING,
        }),
      );
    });
  });

  describe('Combined decorators', () => {
    it('should work with ConnectService and method decorators together', () => {
      @ConnectService(mockServiceDescriptor)
      class FullController {
        @ConnectMethod()
        unary() {
          return {};
        }

        @ConnectServerStreaming()
        *serverStream() {
          yield {};
        }

        @ConnectClientStreaming()
        async clientStream(_req: AsyncIterable<unknown>) {
          return {};
        }

        @ConnectBidiStreaming()
        async *bidiStream(_req: AsyncIterable<unknown>) {
          yield {};
        }
      }

      // Service should be registered
      expect(metadataStore.get('FullController')).toBe(mockServiceDescriptor);

      // All methods should have metadata
      const unaryMeta = Reflect.getMetadata(
        'microservices:pattern',
        FullController.prototype.unary,
      );
      const serverMeta = Reflect.getMetadata(
        'microservices:pattern',
        FullController.prototype.serverStream,
      );
      const clientMeta = Reflect.getMetadata(
        'microservices:pattern',
        FullController.prototype.clientStream,
      );
      const bidiMeta = Reflect.getMetadata(
        'microservices:pattern',
        FullController.prototype.bidiStream,
      );

      expect(unaryMeta).toBeDefined();
      expect(serverMeta).toBeDefined();
      expect(clientMeta).toBeDefined();
      expect(bidiMeta).toBeDefined();
    });
  });
});
