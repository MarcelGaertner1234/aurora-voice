// Stream processing utilities with timeout and error handling
// Prevents the app from hanging indefinitely on stream operations

export class StreamTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Stream operation timed out after ${timeoutMs}ms`);
    this.name = 'StreamTimeoutError';
  }
}

export class StreamAbortedError extends Error {
  constructor() {
    super('Stream operation was aborted');
    this.name = 'StreamAbortedError';
  }
}

/**
 * Process an async iterable stream with timeout and error handling.
 * Prevents the app from hanging indefinitely if the stream stalls or fails.
 *
 * @param stream - The async iterable to process
 * @param onChunk - Optional callback for each chunk
 * @param timeoutMs - Maximum time to wait for the entire operation (default: 5 minutes)
 * @param signal - Optional AbortSignal to cancel the operation
 * @returns The accumulated string from all chunks
 * @throws StreamTimeoutError if the operation times out
 * @throws StreamAbortedError if the operation is aborted via signal
 */
export async function processStreamWithTimeout(
  stream: AsyncIterable<string>,
  onChunk?: (chunk: string) => void,
  timeoutMs: number = 60000, // Fix M6: 1 minute default (was 5 minutes - too long)
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullText = '';
    let completed = false;

    // Setup timeout
    const timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        reject(new StreamTimeoutError(timeoutMs));
      }
    }, timeoutMs);

    // Setup abort handler
    const abortHandler = () => {
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
        reject(new StreamAbortedError());
      }
    };

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        reject(new StreamAbortedError());
        return;
      }
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    // Process the stream
    (async () => {
      try {
        for await (const chunk of stream) {
          if (completed) break;

          fullText += chunk;
          onChunk?.(chunk);
        }

        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          resolve(fullText);
        }
      } catch (error) {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      } finally {
        // Always clean up event listener to prevent memory leaks
        signal?.removeEventListener('abort', abortHandler);
      }
    })();
  });
}

/**
 * Create an AbortController with a timeout that automatically aborts after the specified duration.
 *
 * @param timeoutMs - Time until automatic abort (default: 5 minutes)
 * @returns Object containing the controller and a cleanup function
 */
export function createTimeoutController(timeoutMs: number = 300000): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    cleanup: () => clearTimeout(timeoutId),
  };
}
