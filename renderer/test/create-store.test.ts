import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/data/store/create-store.ts";

test("getState returns the initial value", () => {
  const store = createStore({ count: 0 });
  assert.deepEqual(store.getState(), { count: 0 });
});

test("setState notifies subscribers", () => {
  const store = createStore({ count: 0 });
  let notified = 0;
  store.subscribe(() => {
    notified += 1;
  });
  store.setState({ count: 1 });
  assert.equal(notified, 1);
  assert.equal(store.getState().count, 1);
});

test("setState with the exact same reference is a no-op (no notification)", () => {
  const store = createStore({ count: 0 });
  const initial = store.getState();
  let notified = 0;
  store.subscribe(() => {
    notified += 1;
  });
  store.setState(initial);
  assert.equal(notified, 0);
});

test("unsubscribe stops further notifications", () => {
  const store = createStore(0);
  let notified = 0;
  const unsubscribe = store.subscribe(() => {
    notified += 1;
  });
  store.setState(1);
  unsubscribe();
  store.setState(2);
  assert.equal(notified, 1);
});
