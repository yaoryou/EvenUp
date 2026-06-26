EvenUp.QueryService = {
  context: function () {
    return {
      members: EvenUp.MemberRepository.list(),
      payments: EvenUp.PaymentRepository.list(),
      shares: EvenUp.PaymentRepository.listShares(),
      batches: EvenUp.TransferRepository.listBatches(),
      transfers: EvenUp.TransferRepository.listTransfers(),
      allocations: EvenUp.TransferRepository.listAllocations()
    };
  },

  debts: function (context) {
    var data = context || this.context();
    return EvenUp.DebtCalculator.calculate(
      data.payments,
      data.shares,
      data.batches,
      data.allocations
    );
  },

  preview: function () {
    var context = this.context();
    var debts = this.debts(context);
    var openPaymentIds = new Set(debts.filter(function (debt) {
      return debt.remainingAmount > 0;
    }).map(function (debt) {
      return debt.paymentId;
    }));
    var directRoutes = EvenUp.DirectRouteCalculator.calculate(debts);
    var optimizedRoutes = EvenUp.OptimizedRouteCalculator.calculate(debts);
    var balances = {};
    debts.filter(function (debt) {
      return debt.remainingAmount > 0;
    }).forEach(function (debt) {
      balances[debt.creditorMemberId] =
        (balances[debt.creditorMemberId] || 0) + debt.remainingAmount;
      balances[debt.debtorMemberId] =
        (balances[debt.debtorMemberId] || 0) - debt.remainingAmount;
    });

    return {
      members: context.members.map(this.memberDto),
      open_payments: context.payments.filter(function (payment) {
        return openPaymentIds.has(payment.payment_id);
      }).map(function (payment) {
        return EvenUp.QueryService.paymentDto(payment, context, debts);
      }).sort(function (left, right) {
        return new Date(right.paid_at) - new Date(left.paid_at);
      }),
      balances: Object.keys(balances).sort().map(function (memberId) {
        return { member_id: memberId, balance: balances[memberId] };
      }),
      direct_routes: directRoutes.map(function (route) {
        return {
          route_key: route.routeKey,
          from_member_id: route.fromMemberId,
          to_member_id: route.toMemberId,
          remaining_amount: route.remainingAmount,
          debts: route.debts.map(function (debt) {
            return {
              payment_id: debt.paymentId,
              description: debt.description,
              paid_at: debt.paidAt,
              remaining_amount: debt.remainingAmount
            };
          })
        };
      }),
      optimized_routes: optimizedRoutes.map(function (route) {
        return {
          from_member_id: route.fromMemberId,
          to_member_id: route.toMemberId,
          amount: route.amount,
          sort_order: route.sortOrder
        };
      }),
      optimized_snapshot_token: EvenUp.SnapshotService.create(debts),
      latest_cancellable_transfer_batch: this.latestActiveBatchDto(context)
    };
  },

  memberDto: function (member) {
    return {
      member_id: member.member_id,
      name: member.name,
      active: member.active === true,
      sort_order: Number(member.sort_order)
    };
  },

  paymentById: function (paymentId) {
    var context = this.context();
    var payment = context.payments.find(function (item) {
      return item.payment_id === paymentId;
    });
    if (!payment) throw new EvenUp.AppError("PAYMENT_NOT_FOUND", "支払いが見つかりません。");
    return this.paymentDto(payment, context, this.debts(context));
  },

  paymentDto: function (payment, context, debts) {
    var paymentShares = context.shares.filter(function (share) {
      return share.payment_id === payment.payment_id;
    });
    var relatedDebts = debts.filter(function (debt) {
      return debt.paymentId === payment.payment_id;
    });
    var debtByMember = {};
    relatedDebts.forEach(function (debt) {
      debtByMember[debt.debtorMemberId] = debt;
    });
    var settleable = relatedDebts.reduce(function (sum, debt) {
      return sum + debt.originalAmount;
    }, 0);
    var allocated = relatedDebts.reduce(function (sum, debt) {
      return sum + debt.allocatedAmount;
    }, 0);
    var status = payment.cancelled_at
      ? "CANCELLED"
      : settleable === 0 || allocated === settleable
        ? "SETTLED"
        : allocated === 0
          ? "UNSETTLED"
          : "PARTIALLY_SETTLED";

    return {
      payment_id: payment.payment_id,
      paid_at: payment.paid_at,
      description: payment.description,
      paid_by: payment.paid_by,
      amount: Number(payment.amount),
      status: status,
      settleable_amount: settleable,
      allocated_amount: allocated,
      remaining_amount: Math.max(settleable - allocated, 0),
      cancelled_at: payment.cancelled_at || null,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      shares: paymentShares.map(function (share) {
        var debt = debtByMember[share.member_id];
        return {
          member_id: share.member_id,
          share_amount: Number(share.share_amount),
          allocated_amount: debt ? debt.allocatedAmount : 0,
          remaining_amount: debt ? debt.remainingAmount : 0
        };
      })
    };
  },

  latestActiveBatchEntity: function (context) {
    var data = context || this.context();
    return data.batches.filter(function (batch) {
      return batch.status === "ACTIVE";
    }).sort(function (left, right) {
      return new Date(right.transferred_at) - new Date(left.transferred_at) ||
        right._rowNumber - left._rowNumber;
    })[0] || null;
  },

  latestActiveBatchDto: function (context) {
    var entity = this.latestActiveBatchEntity(context);
    return entity ? this.transferBatchDto(entity, context) : null;
  },

  transferBatchDto: function (batch, providedContext) {
    var context = providedContext || this.context();
    var paymentsById = {};
    context.payments.forEach(function (payment) {
      paymentsById[payment.payment_id] = payment;
    });
    return {
      transfer_batch_id: batch.transfer_batch_id,
      mode: batch.mode,
      transferred_at: batch.transferred_at,
      status: batch.status,
      cancelled_at: batch.cancelled_at || null,
      transfers: context.transfers.filter(function (transfer) {
        return transfer.transfer_batch_id === batch.transfer_batch_id;
      }).sort(function (left, right) {
        return Number(left.sort_order) - Number(right.sort_order);
      }).map(function (transfer) {
        return {
          transfer_id: transfer.transfer_id,
          from_member_id: transfer.from_member_id,
          to_member_id: transfer.to_member_id,
          amount: Number(transfer.amount),
          sort_order: Number(transfer.sort_order)
        };
      }),
      allocations: context.allocations.filter(function (allocation) {
        return allocation.transfer_batch_id === batch.transfer_batch_id;
      }).sort(function (left, right) {
        return Number(left.sort_order) - Number(right.sort_order);
      }).map(function (allocation) {
        var payment = paymentsById[allocation.payment_id];
        return {
          payment_id: allocation.payment_id,
          description: payment ? payment.description : "",
          member_id: allocation.member_id,
          allocated_amount: Number(allocation.allocated_amount),
          sort_order: Number(allocation.sort_order)
        };
      })
    };
  },

  history: function (payload) {
    var context = this.context();
    var debts = this.debts(context);
    var type = ["ALL", "PAYMENT", "TRANSFER"].indexOf(payload.type) >= 0
      ? payload.type
      : "ALL";
    var limit = Math.min(
      Math.max(Number(payload.limit) || EvenUp.Config.HISTORY_LIMIT, 1),
      EvenUp.Config.HISTORY_LIMIT
    );
    var items = [];

    if (type === "ALL" || type === "PAYMENT") {
      context.payments.forEach(function (payment) {
        items.push({
          type: "PAYMENT",
          occurred_at: payment.paid_at,
          payment: EvenUp.QueryService.paymentDto(payment, context, debts),
          _time: new Date(payment.paid_at).getTime(),
          _typeOrder: 1,
          _rowNumber: payment._rowNumber
        });
      });
    }
    if (type === "ALL" || type === "TRANSFER") {
      context.batches.forEach(function (batch) {
        items.push({
          type: "TRANSFER",
          occurred_at: batch.transferred_at,
          transfer_batch: EvenUp.QueryService.transferBatchDto(batch, context),
          _time: new Date(batch.transferred_at).getTime(),
          _typeOrder: 2,
          _rowNumber: batch._rowNumber
        });
      });
    }

    items.sort(this.compareHistoryItems);
    var cursor = payload.cursor ? this.decodeCursor(payload.cursor) : null;
    if (cursor) {
      items = items.filter(function (item) {
        return EvenUp.QueryService.isAfterCursor(item, cursor);
      });
    }
    var page = items.slice(0, limit);
    var hasMore = items.length > limit;
    var nextCursor = hasMore && page.length
      ? this.encodeCursor(page[page.length - 1])
      : null;

    return {
      items: page.map(function (item) {
        return item.type === "PAYMENT"
          ? { type: item.type, occurred_at: item.occurred_at, payment: item.payment }
          : { type: item.type, occurred_at: item.occurred_at, transfer_batch: item.transfer_batch };
      }),
      next_cursor: nextCursor,
      has_more: hasMore
    };
  },

  compareHistoryItems: function (left, right) {
    return right._time - left._time ||
      right._typeOrder - left._typeOrder ||
      right._rowNumber - left._rowNumber;
  },

  isAfterCursor: function (item, cursor) {
    if (item._time !== cursor.time) return item._time < cursor.time;
    if (item._typeOrder !== cursor.typeOrder) return item._typeOrder < cursor.typeOrder;
    return item._rowNumber < cursor.rowNumber;
  },

  encodeCursor: function (item) {
    return Utilities.base64EncodeWebSafe(JSON.stringify({
      time: item._time,
      typeOrder: item._typeOrder,
      rowNumber: item._rowNumber
    })).replace(/=+$/, "");
  },

  decodeCursor: function (cursor) {
    try {
      var bytes = Utilities.base64DecodeWebSafe(cursor);
      return JSON.parse(Utilities.newBlob(bytes).getDataAsString());
    } catch (error) {
      throw new EvenUp.AppError("VALIDATION_ERROR", "履歴カーソルが不正です。");
    }
  }
};
