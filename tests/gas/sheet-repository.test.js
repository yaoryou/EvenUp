import test from "node:test";
import assert from "node:assert/strict";
import { loadGasModules } from "../helpers/load-gas-module.js";

function loadRepository() {
  let spreadsheetOpens = 0;
  let sheetReads = 0;
  const sheet = {
    getDataRange() {
      return {
        getValues() {
          sheetReads += 1;
          return [["member_id", "name"], ["M001", "ナカチ"]];
        }
      };
    }
  };
  const EvenUp = loadGasModules(["02_response.gs", "06_sheet_repository.gs"], {
    PropertiesService: {
      getScriptProperties() {
        return { getProperty: () => "spreadsheet-id" };
      }
    },
    SpreadsheetApp: {
      openById() {
        spreadsheetOpens += 1;
        return { getSheetByName: () => sheet };
      }
    }
  });
  return {
    repository: EvenUp.SheetRepository,
    counts: () => ({ spreadsheetOpens, sheetReads })
  };
}

test("sheet rows and spreadsheet handle are reused within one execution", () => {
  const { repository, counts } = loadRepository();

  const first = repository.readAll("members");
  const second = repository.readAll("members");

  assert.equal(first, second);
  assert.deepEqual(counts(), { spreadsheetOpens: 1, sheetReads: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(repository.metrics())), {
    spreadsheet_opens: 1,
    sheet_reads: 1,
    sheet_cache_hits: 1,
    sheet_writes: 0,
    rows_read: 1,
    rows_written: 0
  });
});

test("execution cache reset forces a fresh spreadsheet read", () => {
  const { repository, counts } = loadRepository();
  repository.readAll("members");

  repository.resetExecutionCache();
  repository.readAll("members");

  assert.deepEqual(counts(), { spreadsheetOpens: 2, sheetReads: 2 });
});
