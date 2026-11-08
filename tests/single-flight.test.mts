import assert from "node:assert/strict";
import test from "node:test";

import { createSingleFlightRunner } from "../lib/async/single-flight.ts";

test("single-flight runner coalesces parallel calls into one execution", async () => {
  const calls: string[] = [];
  const run = createSingleFlightRunner();

  const [a, b, c] = await Promise.all([
    run(async () => {
      calls.push("start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      calls.push("finish");
      return "ok";
    }),
    run(async () => {
      calls.push("unexpected-second-call");
      return "second";
    }),
    run(async () => {
      calls.push("unexpected-third-call");
      return "third";
    }),
  ]);

  assert.equal(a, "ok");
  assert.equal(b, "ok");
  assert.equal(c, "ok");
  assert.deepEqual(calls, ["start", "finish"]);
});

test("single-flight runner allows a new execution after the previous one settles", async () => {
  let callCount = 0;
  const run = createSingleFlightRunner();

  const first = await run(async () => {
    callCount += 1;
    return "first";
  });

  const second = await run(async () => {
    callCount += 1;
    return "second";
  });

  assert.equal(first, "first");
  assert.equal(second, "second");
  assert.equal(callCount, 2);
});
