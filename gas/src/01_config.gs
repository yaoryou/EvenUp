EvenUp.Config = Object.freeze({
  API_VERSION: "v1",
  TIME_ZONE: "Asia/Tokyo",
  LOCK_TIMEOUT_MS: 10000,
  HISTORY_LIMIT: 20,
  SHEETS: {
    members: ["member_id", "name", "active", "sort_order", "created_at", "updated_at"],
    payments: ["payment_id", "request_id", "paid_at", "description", "paid_by", "amount", "cancelled_at", "created_at", "updated_at"],
    payment_shares: ["payment_id", "member_id", "share_amount", "created_at", "updated_at"],
    transfer_batches: ["transfer_batch_id", "request_id", "mode", "transferred_at", "status", "cancelled_at", "created_at", "updated_at"],
    transfers: ["transfer_id", "transfer_batch_id", "from_member_id", "to_member_id", "amount", "sort_order", "created_at"],
    transfer_allocations: ["allocation_id", "transfer_batch_id", "payment_id", "member_id", "allocated_amount", "sort_order", "created_at"]
  }
});
