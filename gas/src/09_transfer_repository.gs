EvenUp.TransferRepository = {
  listBatches: function () {
    return EvenUp.SheetRepository.readAll("transfer_batches");
  },

  listTransfers: function () {
    return EvenUp.SheetRepository.readAll("transfers");
  },

  listAllocations: function () {
    return EvenUp.SheetRepository.readAll("transfer_allocations");
  },

  findBatchByRequestId: function (requestId) {
    return this.listBatches().find(function (batch) { return batch.request_id === requestId; }) || null;
  },

  findBatchById: function (batchId) {
    return this.listBatches().find(function (batch) {
      return batch.transfer_batch_id === batchId;
    }) || null;
  },

  updateBatch: function (batch) {
    EvenUp.SheetRepository.updateRow("transfer_batches", batch._rowNumber, batch);
  }
};
