import { Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  toAsyncGenerator,
  transformToObservable,
} from '../../src/utils/async.js';

describe('Async Utilities', () => {
  describe('transformToObservable', () => {
    it('should return Observable as-is', () => {
      const obs = new Observable((sub) => {
        sub.next(1);
        sub.complete();
      });

      const result = transformToObservable(obs);

      expect(result).toBe(obs);
    });

    it('should convert Promise to Observable', async () => {
      const promise = Promise.resolve('test');
      const result = transformToObservable(promise);

      expect(result).toBeInstanceOf(Observable);

      const value = await new Promise((resolve) => {
        result.subscribe({ next: resolve });
      });

      expect(value).toBe('test');
    });

    it('should convert plain value to Observable', async () => {
      const value = { data: 'test' };
      const result = transformToObservable(value);

      expect(result).toBeInstanceOf(Observable);

      const received = await new Promise((resolve) => {
        result.subscribe({ next: resolve });
      });

      expect(received).toEqual(value);
    });

    it('should handle Promise rejection', async () => {
      const error = new Error('test error');
      const promise = Promise.reject(error);
      const result = transformToObservable(promise);

      await expect(
        new Promise((_, reject) => {
          result.subscribe({ error: reject });
        }),
      ).rejects.toThrow('test error');
    });
  });

  describe('toAsyncGenerator', () => {
    it('should convert Observable to AsyncGenerator', async () => {
      const obs = new Observable<number>((sub) => {
        sub.next(1);
        sub.next(2);
        sub.next(3);
        sub.complete();
      });

      const values: number[] = [];
      for await (const value of toAsyncGenerator(obs)) {
        values.push(value);
      }

      expect(values).toEqual([1, 2, 3]);
    });

    it('should pass through AsyncGenerator', async () => {
      async function* gen() {
        yield 'a';
        yield 'b';
        yield 'c';
      }

      const values: string[] = [];
      for await (const value of toAsyncGenerator(gen())) {
        values.push(value);
      }

      expect(values).toEqual(['a', 'b', 'c']);
    });

    it('should throw for unsupported input types', async () => {
      const invalidInput = 'not an observable or generator';

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of toAsyncGenerator(invalidInput as never)) {
          // Should not reach here
        }
      }).rejects.toThrow('Unsupported input type');
    });

    it('should handle empty Observable', async () => {
      const obs = new Observable<number>((sub) => {
        sub.complete();
      });

      const values: number[] = [];
      for await (const value of toAsyncGenerator(obs)) {
        values.push(value);
      }

      expect(values).toEqual([]);
    });

    it('should propagate Observable errors', async () => {
      const obs = new Observable<number>((sub) => {
        sub.next(1);
        sub.error(new Error('observable error'));
      });

      const values: number[] = [];

      await expect(async () => {
        for await (const value of toAsyncGenerator(obs)) {
          values.push(value);
        }
      }).rejects.toThrow('observable error');

      expect(values).toEqual([1]);
    });
  });
});
