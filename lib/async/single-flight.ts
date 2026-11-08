export type SingleFlightRunner<T> = (task: () => Promise<T>) => Promise<T>;

export function createSingleFlightRunner<T>(): SingleFlightRunner<T> {
  let inFlight: Promise<T> | null = null;

  return async (task) => {
    if (inFlight) return inFlight;

    const current = task().finally(() => {
      if (inFlight === current) {
        inFlight = null;
      }
    });

    inFlight = current;
    return current;
  };
}
