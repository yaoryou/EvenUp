EvenUp.TransferService = {
  createDirect: function (payload, requestId) {
    var existing = EvenUp.TransferRepository.findBatchByRequestId(requestId);
    if (existing) return { transfer_batch: existing, idempotent_replay: true, preview: EvenUp.QueryService.preview() };

    var fromId = EvenUp.Validation.requireString(payload.from_member_id, "from_member_id");
    var toId = EvenUp.Validation.requireString(payload.to_member_id, "to_member_id");
    var debts = EvenUp.QueryService.debts();
    var routes = EvenUp.DirectRouteCalculator.calculate(debts);
    var route = routes.find(function (item) {
      return item.fromMemberId === fromId && item.toMemberId === toId;
    });
    if (!route || route.routeKey !== payload.route_key) {
      throw new EvenUp.AppError("DIRECT_ROUTE_CONFLICT", "個別精算の内容が更新されました。");
    }
    var amount = Number(payload.amount);
    if (!Number.isInteger(amount) || amount < 0 || amount > route.remainingAmount ||
      (route.remainingAmount > 0 && amount < 1)) {
      throw new EvenUp.AppError("VALIDATION_ERROR", "入力内容を確認してください。", {
        amount: route.remainingAmount > 0
          ? "1円以上、候補金額以下の整数を入力してください。"
          : "0円を入力してください。"
      });
    }
    var allocations = EvenUp.AllocationCalculator.direct(route, amount);

    var now = new Date();
    var batchId = Utilities.getUuid();
    var batch = {
      transfer_batch_id: batchId,
      request_id: requestId,
      mode: "DIRECT",
      transferred_at: now,
      status: "ACTIVE",
      cancelled_at: "",
      created_at: now,
      updated_at: now
    };
    EvenUp.SheetRepository.appendRows("transfer_batches", [batch]);
    EvenUp.SheetRepository.appendRows("transfers", [{
      transfer_id: Utilities.getUuid(),
      transfer_batch_id: batchId,
      from_member_id: fromId,
      to_member_id: toId,
      amount: amount,
      sort_order: 1,
      created_at: now
    }]);
    EvenUp.SheetRepository.appendRows("transfer_allocations", allocations.map(function (allocation) {
      return {
        allocation_id: Utilities.getUuid(),
        transfer_batch_id: batchId,
        payment_id: allocation.paymentId,
        member_id: allocation.memberId,
        allocated_amount: allocation.allocatedAmount,
        sort_order: allocation.sortOrder,
        created_at: now
      };
    }));
    return { transfer_batch: batch, idempotent_replay: false, preview: EvenUp.QueryService.preview() };
  },

  createOptimized: function (payload, requestId) {
    var existing = EvenUp.TransferRepository.findBatchByRequestId(requestId);
    if (existing) return { transfer_batch: existing, idempotent_replay: true, preview: EvenUp.QueryService.preview() };

    var debts = EvenUp.QueryService.debts();
    if (!debts.some(function (debt) { return debt.remainingAmount > 0; })) {
      throw new EvenUp.AppError("NO_OPEN_DEBTS", "未精算の残額はありません。");
    }
    var snapshot = EvenUp.SnapshotService.create(debts);
    if (snapshot !== payload.snapshot_token) {
      throw new EvenUp.AppError("SNAPSHOT_CONFLICT", "精算内容が更新されました。");
    }

    var routes = EvenUp.OptimizedRouteCalculator.calculate(debts);
    var allocations = EvenUp.AllocationCalculator.optimized(debts);
    var now = new Date();
    var batchId = Utilities.getUuid();
    var batch = {
      transfer_batch_id: batchId,
      request_id: requestId,
      mode: "OPTIMIZED",
      transferred_at: now,
      status: "ACTIVE",
      cancelled_at: "",
      created_at: now,
      updated_at: now
    };
    EvenUp.SheetRepository.appendRows("transfer_batches", [batch]);
    EvenUp.SheetRepository.appendRows("transfers", routes.map(function (route) {
      return {
        transfer_id: Utilities.getUuid(),
        transfer_batch_id: batchId,
        from_member_id: route.fromMemberId,
        to_member_id: route.toMemberId,
        amount: route.amount,
        sort_order: route.sortOrder,
        created_at: now
      };
    }));
    EvenUp.SheetRepository.appendRows("transfer_allocations", allocations.map(function (allocation) {
      return {
        allocation_id: Utilities.getUuid(),
        transfer_batch_id: batchId,
        payment_id: allocation.paymentId,
        member_id: allocation.memberId,
        allocated_amount: allocation.allocatedAmount,
        sort_order: allocation.sortOrder,
        created_at: now
      };
    }));
    return { transfer_batch: batch, idempotent_replay: false, preview: EvenUp.QueryService.preview() };
  },

  cancelLatest: function (payload) {
    var batchId = EvenUp.Validation.requireString(
      payload.transfer_batch_id,
      "transfer_batch_id"
    );
    var requested = EvenUp.TransferRepository.findBatchById(batchId);
    if (!requested) {
      throw new EvenUp.AppError("TRANSFER_BATCH_NOT_FOUND", "精算記録が見つかりません。");
    }
    if (requested.status === "CANCELLED") {
      return {
        cancelled_transfer_batch: EvenUp.QueryService.transferBatchDto(requested),
        preview: EvenUp.QueryService.preview()
      };
    }

    var latest = EvenUp.QueryService.latestActiveBatchEntity();
    if (!latest || latest.transfer_batch_id !== batchId) {
      throw new EvenUp.AppError(
        "TRANSFER_BATCH_NOT_LATEST",
        "取り消せるのは直前の精算記録だけです。"
      );
    }
    var now = new Date();
    latest.status = "CANCELLED";
    latest.cancelled_at = now;
    latest.updated_at = now;
    EvenUp.TransferRepository.updateBatch(latest);
    return {
      cancelled_transfer_batch: EvenUp.QueryService.transferBatchDto(latest),
      preview: EvenUp.QueryService.preview()
    };
  }
};
