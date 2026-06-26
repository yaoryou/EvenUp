EvenUp.SheetRepository = {
  spreadsheet: function () {
    var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (!id) throw new EvenUp.AppError("INTERNAL_ERROR", "スプレッドシート設定がありません。");
    return SpreadsheetApp.openById(id);
  },

  readAll: function (sheetName) {
    var sheet = this.spreadsheet().getSheetByName(sheetName);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    var headers = values[0];
    return values.slice(1).map(function (row, index) {
      var entity = { _rowNumber: index + 2 };
      headers.forEach(function (header, column) {
        entity[header] = row[column];
      });
      return entity;
    });
  },

  appendRows: function (sheetName, rows) {
    if (!rows.length) return;
    var sheet = this.spreadsheet().getSheetByName(sheetName);
    var headers = EvenUp.Config.SHEETS[sheetName];
    var values = rows.map(function (row) {
      return headers.map(function (header) { return row[header] === undefined ? "" : row[header]; });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  },

  updateRow: function (sheetName, rowNumber, entity) {
    var sheet = this.spreadsheet().getSheetByName(sheetName);
    var headers = EvenUp.Config.SHEETS[sheetName];
    var values = headers.map(function (header) {
      return entity[header] === undefined ? "" : entity[header];
    });
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([values]);
  },

  replaceAll: function (sheetName, rows) {
    var sheet = this.spreadsheet().getSheetByName(sheetName);
    var headers = EvenUp.Config.SHEETS[sheetName];
    var existingRows = Math.max(sheet.getLastRow() - 1, 0);
    if (existingRows > 0) {
      sheet.getRange(2, 1, existingRows, headers.length).clearContent();
    }
    if (!rows.length) return;
    var values = rows.map(function (row) {
      return headers.map(function (header) {
        return row[header] === undefined ? "" : row[header];
      });
    });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }
};
