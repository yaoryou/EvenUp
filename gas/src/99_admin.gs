function setupSheets() {
  var spreadsheet = EvenUp.SheetRepository.spreadsheet();
  spreadsheet.setSpreadsheetTimeZone(EvenUp.Config.TIME_ZONE);
  Object.keys(EvenUp.Config.SHEETS).forEach(function (sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
    var headers = EvenUp.Config.SHEETS[sheetName];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      var actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      if (JSON.stringify(actual) !== JSON.stringify(headers)) {
        throw new Error(sheetName + "のヘッダーが定義と一致しません。");
      }
    }
    sheet.setFrozenRows(1);
  });
}

function validateDatabase() {
  var spreadsheet = EvenUp.SheetRepository.spreadsheet();
  if (spreadsheet.getSpreadsheetTimeZone() !== EvenUp.Config.TIME_ZONE) {
    throw new Error("スプレッドシートのタイムゾーンがAsia/Tokyoではありません。");
  }
  EvenUp.SheetSchema.validate(spreadsheet);
  return "OK";
}

function seedInitialMembers() {
  throw new Error("固定メンバーの投入は廃止しました。membersシートへグループのメンバーを登録してください。");
}

function setAccessKey(accessKey) {
  if (!accessKey || accessKey.length < 32) throw new Error("32文字以上のアクセスキーを指定してください。");
  PropertiesService.getScriptProperties().setProperty("ACCESS_KEY_SHA256", EvenUp.Auth.hash(accessKey));
}

function showConfigurationStatus() {
  var properties = PropertiesService.getScriptProperties();
  return {
    spreadsheet_id_configured: Boolean(properties.getProperty("SPREADSHEET_ID")),
    access_key_configured: Boolean(properties.getProperty("ACCESS_KEY_SHA256")),
    spreadsheet_time_zone: EvenUp.SheetRepository.spreadsheet().getSpreadsheetTimeZone()
  };
}
