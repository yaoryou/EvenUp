function fingerprint(payload) {
  return JSON.stringify(payload);
}

export function createPendingRequestTracker(createId) {
  let pending = null;

  return {
    idFor(payload) {
      const payloadFingerprint = fingerprint(payload);
      if (!pending || pending.payloadFingerprint !== payloadFingerprint) {
        pending = {
          requestId: createId(),
          payloadFingerprint
        };
      }
      return pending.requestId;
    },

    complete(requestId) {
      if (pending?.requestId === requestId) pending = null;
    },

    fail(requestId, retryable) {
      if (!retryable) this.complete(requestId);
    }
  };
}
