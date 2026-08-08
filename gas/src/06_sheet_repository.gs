EvenUp.SheetRepository = {
  _spreadsheet: null,
  _readCache: {},
  _metrics: {},

  resetExecutionCache: function () {
    this._spreadsheet = null;
    this._readCache = {};
    this._metrics = {
      spreadsheet_opens: 0,
      sheet_reads: 0,
      sheet_cache_hits: 0,
      sheet_writes: 0,
      rows_read: 0,
      rows_written: 0
    };
  },

  metrics: function () {
    return Object.assign({}, this._metrics);
  },

  spreadsheet: function () {
    if (this._spreadsheet) return this._spreadsheet;
    var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (!id) throw new EvenUp.AppError("INTERNAL_ERROR", "スプレッドシート設定がありません。");
    this._metrics.spreadsheet_opens += 1;
    this._spreadsheet = SpreadsheetApp.openById(id);
    return this._spreadsheet;
  },

  readAll: function (sheetName) {
    if (Object.prototype.hasOwnProperty.call(this._readCache, sheetName)) {
      this._metrics.sheet_cache_hits += 1;
      return this._readCache[sheetName];
    }
    var sheet = this.spreadsheet().getSheetByName(sheetName);
    var values = sheet.getDataRange().getValues();
    this._metrics.sheet_reads += 1;
    this._metrics.rows_read += Math.max(values.length - 1, 0);
    if (values.length < 2) {
      this._readCache[sheetName] = [];
      return this._readCache[sheetName];
    }
    var headers = values[0];
    this._readCache[sheetName] = values.slice(1).map(function (row, index) {
      var entity = { _rowNumber: index + 2 };
      headers.forEach(function (header, column) {
        entity[header] = row[column];
      });
      return entity;
    });
    return this._readCache[sheetName];
  },

  appendRows: function (sheetName, rows) {
    if (!rows.length) return;
    delete this._readCache[sheetName];
    var sheet = this.spreadsheet().getSheetByName(sheetName);
    var headers = EvenUp.Config.SHEETS[sheetName];
    var values = rows.map(function (row) {
      return headers.map(function (header) { return row[header] === undefined ? "" : row[header]; });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
    this._metrics.sheet_writes += 1;
    this._metrics.rows_written += values.length;
  },

  updateRow: function (sheetName, rowNumber, entity) {
    delete this._readCache[sheetName];
    var sheet = this.spreadsheet().getSheetByName(sheetName);
    var headers = EvenUp.Config.SHEETS[sheetName];
    var values = headers.map(function (header) {
      return entity[header] === undefined ? "" : entity[header];
    });
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([values]);
    this._metrics.sheet_writes += 1;
    this._metrics.rows_written += 1;
  },

  replaceAll: function (sheetName, rows) {
    delete this._readCache[sheetName];
    var sheet = this.spreadsheet().getSheetByName(sheetName);
    var headers = EvenUp.Config.SHEETS[sheetName];
    var existingRows = Math.max(sheet.getLastRow() - 1, 0);
    if (existingRows > 0) {
      sheet.getRange(2, 1, existingRows, headers.length).clearContent();
    }
    if (!rows.length) {
      this._metrics.sheet_writes += 1;
      return;
    }
    var values = rows.map(function (row) {
      return headers.map(function (header) {
        return row[header] === undefined ? "" : row[header];
      });
    });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    this._metrics.sheet_writes += 1;
    this._metrics.rows_written += values.length;
  }
};

EvenUp.SheetRepository.resetExecutionCache();
