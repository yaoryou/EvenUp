EvenUp.MigrationService = {
  FORMAT: "evenup-sheet-snapshot",
  VERSION: 1,

  exportSnapshot: function () {
    var sheets = {};
    Object.keys(EvenUp.Config.SHEETS).forEach(function (sheetName) {
      sheets[sheetName] = EvenUp.SheetRepository.readAll(sheetName).map(function (row) {
        var exported = {};
        EvenUp.Config.SHEETS[sheetName].forEach(function (header) {
          exported[header] = row[header];
        });
        return exported;
      });
    });

    var payload = {
      format: this.FORMAT,
      version: this.VERSION,
      exported_at: EvenUp.DateTime.now(),
      time_zone: EvenUp.Config.TIME_ZONE,
      sheets: sheets
    };
    var serialized = JSON.stringify(payload);
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      serialized,
      Utilities.Charset.UTF_8
    );
    payload.checksum_sha256 = digest.map(function (value) {
      return (value < 0 ? value + 256 : value).toString(16).padStart(2, "0");
    }).join("");
    payload.row_counts = Object.keys(sheets).reduce(function (counts, sheetName) {
      counts[sheetName] = sheets[sheetName].length;
      return counts;
    }, {});
    return payload;
  }
};
