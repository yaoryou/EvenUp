const initialState = () => ({
  auth: { status: "checking" },
  data: {
    members: [],
    openPayments: [],
    balances: [],
    directRoutes: [],
    optimizedRoutes: [],
    optimizedSnapshotToken: null,
    latestCancellableTransferBatch: null
  },
  history: { items: [], nextCursor: null, hasMore: true, loaded: false, stale: true, type: "ALL" },
  ui: { route: "record", settlementMode: "DIRECT", toast: null }
});

let state = initialState();
const listeners = new Set();

export function getState() {
  return state;
}

export function setState(updater) {
  state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetStore() {
  state = initialState();
  listeners.forEach((listener) => listener(state));
}

export function applyPreview(data) {
  setState((current) => ({
    ...current,
    data: {
      members: data.members || current.data.members,
      openPayments: data.open_payments || [],
      balances: data.balances || [],
      directRoutes: data.direct_routes || [],
      optimizedRoutes: data.optimized_routes || [],
      optimizedSnapshotToken: data.optimized_snapshot_token || null,
      latestCancellableTransferBatch: data.latest_cancellable_transfer_batch || null
    },
    history: { ...current.history, stale: true }
  }));
}
