EvenUp.PaymentService = {
  create: function (payload, requestId) {
    var existing = EvenUp.PaymentRepository.findByRequestId(requestId);
    if (existing) return { payment: existing, idempotent_replay: true };

    var description = EvenUp.Validation.requireString(payload.description, "description", 100);
    var amount = EvenUp.Validation.requireAmount(payload.amount, "amount");
    var paidBy = EvenUp.Validation.requireString(payload.paid_by, "paid_by");
    var targetIds = Array.isArray(payload.target_member_ids) ? payload.target_member_ids : [];
    if (!targetIds.length) {
      throw new EvenUp.AppError("VALIDATION_ERROR", "対象メンバーを選択してください。");
    }

    var members = EvenUp.MemberRepository.list();
    var activeIds = new Set(members.filter(function (member) { return member.active === true; })
      .map(function (member) { return member.member_id; }));
    if (!activeIds.has(paidBy) || targetIds.some(function (id) { return !activeIds.has(id); })) {
      throw new EvenUp.AppError("MEMBER_INACTIVE", "無効なメンバーが含まれています。");
    }

    var now = new Date();
    var paymentId = Utilities.getUuid();
    var shares = EvenUp.ShareCalculator.calculate(amount, paidBy, targetIds);
    var payment = {
      payment_id: paymentId,
      request_id: requestId,
      paid_at: now,
      description: description,
      paid_by: paidBy,
      amount: amount,
      cancelled_at: "",
      created_at: now,
      updated_at: now
    };

    EvenUp.SheetRepository.appendRows("payments", [payment]);
    EvenUp.SheetRepository.appendRows("payment_shares", shares.map(function (share) {
      return {
        payment_id: paymentId,
        member_id: share.memberId,
        share_amount: share.shareAmount,
        created_at: now,
        updated_at: now
      };
    }));
    return { payment: payment, idempotent_replay: false };
  },

  update: function (payload) {
    var payment = this.requireEditablePayment(payload.payment_id, payload.expected_updated_at);
    var validated = this.validateInput(payload);
    var now = new Date();
    var shares = EvenUp.ShareCalculator.calculate(
      validated.amount,
      validated.paidBy,
      validated.targetIds
    );

    payment.description = validated.description;
    payment.amount = validated.amount;
    payment.paid_by = validated.paidBy;
    payment.updated_at = now;
    EvenUp.PaymentRepository.update(payment);
    EvenUp.PaymentRepository.replaceShares(payment.payment_id, shares.map(function (share) {
      return {
        payment_id: payment.payment_id,
        member_id: share.memberId,
        share_amount: share.shareAmount,
        created_at: now,
        updated_at: now
      };
    }));
    return { payment: EvenUp.QueryService.paymentById(payment.payment_id) };
  },

  cancel: function (payload) {
    var payment = this.requireEditablePayment(payload.payment_id, payload.expected_updated_at);
    var now = new Date();
    payment.cancelled_at = now;
    payment.updated_at = now;
    EvenUp.PaymentRepository.update(payment);
    return { payment: EvenUp.QueryService.paymentById(payment.payment_id) };
  },

  requireEditablePayment: function (paymentId, expectedUpdatedAt) {
    var payment = EvenUp.PaymentRepository.findById(
      EvenUp.Validation.requireString(paymentId, "payment_id")
    );
    if (!payment) throw new EvenUp.AppError("PAYMENT_NOT_FOUND", "支払いが見つかりません。");
    if (payment.cancelled_at) {
      throw new EvenUp.AppError("VALIDATION_ERROR", "取消済みの支払いは変更できません。");
    }
    if (!this.sameInstant(payment.updated_at, expectedUpdatedAt)) {
      throw new EvenUp.AppError("EDIT_CONFLICT", "支払いが別の端末で更新されました。");
    }
    var allocated = EvenUp.QueryService.debts()
      .filter(function (debt) { return debt.paymentId === payment.payment_id; })
      .reduce(function (sum, debt) { return sum + debt.allocatedAmount; }, 0);
    if (allocated > 0) {
      throw new EvenUp.AppError(
        "PAYMENT_HAS_ALLOCATIONS",
        "精算済みの金額があるため、先に最新の精算記録を取り消してください。"
      );
    }
    return payment;
  },

  validateInput: function (payload) {
    var description = EvenUp.Validation.requireString(payload.description, "description", 100);
    var amount = EvenUp.Validation.requireAmount(payload.amount, "amount");
    var paidBy = EvenUp.Validation.requireString(payload.paid_by, "paid_by");
    var targetIds = Array.isArray(payload.target_member_ids)
      ? Array.from(new Set(payload.target_member_ids))
      : [];
    if (!targetIds.length) {
      throw new EvenUp.AppError("VALIDATION_ERROR", "対象メンバーを選択してください。");
    }
    var activeIds = new Set(EvenUp.MemberRepository.list()
      .filter(function (member) { return member.active === true; })
      .map(function (member) { return member.member_id; }));
    if (!activeIds.has(paidBy) || targetIds.some(function (id) { return !activeIds.has(id); })) {
      throw new EvenUp.AppError("MEMBER_INACTIVE", "無効なメンバーが含まれています。");
    }
    return {
      description: description,
      amount: amount,
      paidBy: paidBy,
      targetIds: targetIds
    };
  },

  sameInstant: function (stored, expected) {
    if (!stored || !expected) return false;
    return new Date(stored).getTime() === new Date(expected).getTime();
  }
};
