import { isObservable, Observable } from 'rxjs';

export type ResultOrDeferred<T> = T | Promise<T> | Observable<T>;

export const transformToObservable = <T>(
  resultOrDeferred: ResultOrDeferred<T>,
): Observable<T> => {
  if (isObservable(resultOrDeferred)) {
    return resultOrDeferred;
  }

  if (resultOrDeferred instanceof Promise) {
    return new Observable((subscriber) => {
      resultOrDeferred
        .then((value) => {
          subscriber.next(value);
          subscriber.complete();
        })
        .catch((error) => {
          subscriber.error(error);
        });
    });
  }

  return new Observable((subscriber) => {
    subscriber.next(resultOrDeferred);
    subscriber.complete();
  });
};

/**
 * Converts an Observable to an AsyncGenerator.
 * Properly handles backpressure and cleanup.
 */
async function* observableToAsyncGenerator<T>(
  obs$: Observable<T>,
): AsyncGenerator<T> {
  const queue: T[] = [];
  let error: unknown = null;
  let completed = false;
  let resolve: (() => void) | null = null;

  const subscription = obs$.subscribe({
    next: (value) => {
      queue.push(value);
      resolve?.();
    },
    error: (err) => {
      error = err;
      resolve?.();
    },
    complete: () => {
      completed = true;
      resolve?.();
    },
  });

  try {
    while (true) {
      // Yield all items currently in queue
      while (queue.length > 0) {
        const item = queue.shift();
        if (item !== undefined) {
          yield item;
        }
      }

      // Check for errors
      if (error !== null) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      // Exit if completed and queue is empty
      if (completed) {
        break;
      }

      // Wait for more items, completion, or error
      await new Promise<void>((r) => {
        resolve = r;
      });
      resolve = null;
    }
  } finally {
    subscription.unsubscribe();
  }
}

const isAsyncGenerator = (input: unknown): input is AsyncGenerator =>
  typeof input === 'object' && input !== null && Symbol.asyncIterator in input;

/**
 * Converts an Observable or AsyncGenerator to an AsyncGenerator.
 * Useful for uniformly handling streaming responses.
 */
export async function* toAsyncGenerator<T>(
  input: Observable<T> | AsyncGenerator<T>,
): AsyncGenerator<T> {
  if (isObservable(input)) {
    yield* observableToAsyncGenerator(input);
  } else if (isAsyncGenerator(input)) {
    yield* input;
  } else {
    throw new Error(
      `Unsupported input type. Expected Observable or AsyncGenerator, got ${typeof input}`,
    );
  }
}
