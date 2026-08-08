import test from "node:test";
import assert from "node:assert/strict";
import { createPendingRequestTracker } from "../../frontend/js/utils/pending-request.js";

function tracker() {
  let sequence = 0;
  return createPendingRequestTracker(() => `request-${++sequence}`);
}

test("retryable failure reuses the request id for unchanged input", () => {
  const requests = tracker();
  const payload = { description: "ラーメン", amount: 1000 };
  const first = requests.idFor(payload);

  requests.fail(first, true);

  assert.equal(requests.idFor(payload), first);
});

test("changed input starts a new request after an uncertain result", () => {
  const requests = tracker();
  const first = requests.idFor({ description: "ラーメン", amount: 1000 });

  requests.fail(first, true);

  assert.notEqual(
    requests.idFor({ description: "ラーメン・餃子", amount: 1300 }),
    first
  );
});

test("completed and definitive failures clear the pending request", () => {
  const requests = tracker();
  const payload = { description: "ラーメン", amount: 1000 };
  const completed = requests.idFor(payload);
  requests.complete(completed);
  const afterCompletion = requests.idFor(payload);

  requests.fail(afterCompletion, false);

  assert.notEqual(afterCompletion, completed);
  assert.notEqual(requests.idFor(payload), afterCompletion);
});
