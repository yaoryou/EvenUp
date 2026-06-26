EvenUp.SheetSchema = {
  validate: function (spreadsheet) {
    Object.keys(EvenUp.Config.SHEETS).forEach(function (sheetName) {
      var sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) throw new EvenUp.AppError("DATA_INTEGRITY_ERROR", "必要なシートがありません。");
      var expected = EvenUp.Config.SHEETS[sheetName];
      var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new EvenUp.AppError("DATA_INTEGRITY_ERROR", "シートのカラム構成が一致しません。");
      }
    });
  }
};
