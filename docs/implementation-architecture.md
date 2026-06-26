# EvenUp 実装構成書

- 文書バージョン: 2.0
- 作成日: 2026-06-25
- 関連文書:
  - [要件定義書](./requirements.md)
  - [画面設計書](./screen-design.md)
  - [スプレッドシート定義書](./sheet-schema.md)
  - [API仕様書](./api-spec.md)

## 1. 技術構成

### フロントエンド

- HTML5 / CSS
- Vanilla JavaScript
- Native ES Modules
- Fetch API
- Hash navigation
- `localStorage`

### バックエンド

- Google Apps Script V8 Runtime
- Content Service
- Spreadsheet Service
- Lock Service
- Properties Service
- Utilities

React、Vue、外部UIライブラリ、実行時npm依存はMVPでは使用しない。

## 2. 全体像

```text
GitHub Pages
  └─ フロントエンド
       │ POST / text/plain / JSON
       ↓
GAS Webアプリ
  ├─ 認証・検証
  ├─ 残債計算
  ├─ 個別ルート計算
  ├─ 最適化ルート計算
  ├─ FIFO充当
  └─ Repository
       ↓
Googleスプレッドシート
  ├─ members
  ├─ payments
  ├─ payment_shares
  ├─ transfer_batches
  ├─ transfers
  └─ transfer_allocations
```

## 3. リポジトリ構成

```text
EvenUp/
├─ README.md
├─ package.json
├─ eslint.config.js
├─ .prettierrc.json
├─ docs/
├─ frontend/
│  ├─ index.html
│  ├─ 404.html
│  ├─ manifest.webmanifest
│  ├─ favicon.svg
│  ├─ css/
│  │  ├─ tokens.css
│  │  ├─ base.css
│  │  ├─ layout.css
│  │  ├─ components.css
│  │  └─ pages.css
│  └─ js/
│     ├─ config.js
│     ├─ main.js
│     ├─ api/
│     │  ├─ client.js
│     │  └─ errors.js
│     ├─ app/
│     │  ├─ router.js
│     │  ├─ store.js
│     │  └─ bootstrap.js
│     ├─ components/
│     │  ├─ dialog.js
│     │  ├─ bottom-sheet.js
│     │  ├─ toast.js
│     │  ├─ payment-card.js
│     │  ├─ direct-route-card.js
│     │  └─ optimized-route-card.js
│     ├─ pages/
│     │  ├─ access-key-page.js
│     │  ├─ record-page.js
│     │  ├─ settlement-page.js
│     │  └─ history-page.js
│     └─ utils/
│        ├─ currency.js
│        ├─ datetime.js
│        ├─ dom.js
│        ├─ storage.js
│        ├─ validation.js
│        └─ uuid.js
├─ gas/
│  ├─ appsscript.json
│  ├─ .clasp.json.example
│  └─ src/
│     ├─ 00_namespace.gs
│     ├─ 01_config.gs
│     ├─ 02_response.gs
│     ├─ 03_auth.gs
│     ├─ 04_validation.gs
│     ├─ 05_sheet_schema.gs
│     ├─ 06_sheet_repository.gs
│     ├─ 07_member_repository.gs
│     ├─ 08_payment_repository.gs
│     ├─ 09_transfer_repository.gs
│     ├─ 10_share_calculator.gs
│     ├─ 11_debt_calculator.gs
│     ├─ 12_direct_route_calculator.gs
│     ├─ 13_optimized_route_calculator.gs
│     ├─ 14_allocation_calculator.gs
│     ├─ 15_snapshot_service.gs
│     ├─ 16_payment_service.gs
│     ├─ 17_transfer_service.gs
│     ├─ 18_query_service.gs
│     ├─ 19_actions.gs
│     ├─ 20_router.gs
│     ├─ 21_webapp.gs
│     └─ 99_admin.gs
└─ tests/
   ├─ frontend/
   └─ gas/
      ├─ share-calculator.test.js
      ├─ debt-calculator.test.js
      ├─ direct-route-calculator.test.js
      ├─ optimized-route-calculator.test.js
      ├─ allocation-calculator.test.js
      └─ snapshot-service.test.js
```

## 4. フロントエンド

### 4.1 状態

```js
{
  auth: {
    status: "checking",
    accessKey: null
  },
  settlement: {
    openPayments: [],
    balances: [],
    directRoutes: [],
    optimizedRoutes: [],
    optimizedSnapshotToken: null,
    latestCancellableTransferBatch: null,
    selectedMode: "DIRECT"
  },
  history: {
    type: "ALL",
    items: [],
    nextCursor: null,
    hasMore: true,
    stale: true
  },
  ui: {
    route: "record",
    overlay: null,
    toast: null,
    banner: null
  }
}
```

- 業務データを`localStorage`へ保存しない。
- キー、直前支払者、精算表示モードだけを端末へ保存する。
- 支払い・送金操作後は精算状態を応答の`preview`で置換し、履歴をstaleにする。

### 4.2 APIクライアント

- `text/plain`でPOSTする。
- 既定タイムアウトは20秒とする。
- 書き込みを自動再送しない。
- 明示再送では同じ`request_id`を使う。
- `UNAUTHORIZED`時はキーを削除する。
- 生キーをログへ出さない。

### 4.3 フロント側計算

正データとして独自計算しないもの:

- 確定負担額
- 残債
- 支払い状態
- 個別ルート
- 最適化ルート
- 実際のFIFO充当
- スナップショット

個別送金ダイアログの予定充当だけは表示補助として計算できるが、サーバー応答で必ず置換する。

### 4.4 DOM安全性

- 業務文字列は`textContent`で出力する。
- 外部スクリプトを読み込まない。
- ダイアログとボトムシートのフォーカス管理を共通化する。

## 5. GASの層

| 層 | 責務 |
| --- | --- |
| WebApp | `doPost`、例外境界 |
| Router / Actions | Action許可リスト、入出力変換 |
| Auth / Validation | 認証、型・値検証 |
| Service | ロック、業務ルール、更新手順 |
| Calculator | 負担、残債、ルート、充当 |
| Repository | シート一括読書き |
| SheetSchema | シート・ヘッダー定義 |

ActionやCalculatorからSpreadsheet Serviceを直接呼ばない。

## 6. 計算パイプライン

### 6.1 DebtCalculator

入力:

- 取消されていない支払い
- `payment_shares`
- `ACTIVE`バッチの`transfer_allocations`

出力:

```js
[
  {
    paymentId,
    debtorMemberId,
    creditorMemberId,
    originalAmount,
    allocatedAmount,
    remainingAmount,
    paidAt
  }
]
```

- 支払者本人の負担は出力しない。
- 残額0円の債務は通常の精算候補から除外する。
- 有効充当が元額を超えたら`DATA_INTEGRITY_ERROR`とする。

### 6.2 DirectRouteCalculator

- 残債を`debtorMemberId + creditorMemberId`で集約する。
- 内訳を`paidAt`、`paymentId`順に並べる。
- route keyは送金元・先と現在の債務ID・残額を正規化してハッシュ化する。

### 6.3 OptimizedRouteCalculator

- 全残債をメンバー別純収支へ変換する。
- 決定的な貪欲法で送金ルートを作る。
- 同額時は`member_id`で順序を固定する。

### 6.4 AllocationCalculator

#### DIRECT

- 指定した送金元・先に一致する残債だけを対象にする。
- 古い支払いからFIFOで指定額を充当する。
- 送金額と充当合計を一致させる。

#### OPTIMIZED

- スナップショット内の全残債をそのまま全額充当行へ変換する。
- 実送金行との1対1割当は作らない。
- 同じ`transfer_batch_id`を通して追跡する。

### 6.5 SnapshotService

最適化用トークンは残債の次の値から生成する。

- payment ID
- payment updated_at
- debtor ID
- creditor ID
- original amount
- allocated amount
- remaining amount

表示名、行番号、アクセスキーを含めない。

## 7. 送金作成

### 7.1 DIRECT

```text
ロック
 → request_id確認
 → 最新残債再計算
 → route key・金額検証
 → FIFO充当計算
 → transfer_batches追記
 → transfers追記
 → transfer_allocations追記
 → 整合性検査
 → preview返却
```

### 7.2 OPTIMIZED

```text
ロック
 → request_id確認
 → 最新残債・snapshot再計算
 → token検証
 → 最適化ルート再計算
 → transfer_batches追記
 → transfers一括追記
 → 全残債をallocationsへ一括追記
 → 純収支整合性検査
 → preview返却
```

クライアントから最適化ルート配列を受け取らない。

## 8. 送金取消

```text
ロック
 → 最新ACTIVEバッチ取得
 → 指定ID確認
 → バッチをCANCELLEDへ更新
 → 全残債再計算
 → 整合性検査
 → preview返却
```

子の`transfers`と`transfer_allocations`は変更しない。親状態で有効性を決める。

## 9. 支払い編集・取消

- Service内で有効充当合計を確認する。
- 1円でもあれば`PAYMENT_HAS_ALLOCATIONS`を返す。
- 充当0円の場合だけ編集または取消する。
- 編集では`payment_shares`をロック内で置換する。
- `updated_at`で競合を検知する。

## 10. Repository

- 必要範囲を`getValues()`でまとめて読む。
- 行からエンティティへの変換を純粋関数へ分離する。
- 追記は可能な限り`setValues()`で一括する。
- APIへ物理行番号を出さない。
- 共通履歴のカーソル生成時だけ内部で行位置を利用する。

## 11. ロックと復元

- 書き込みには`getScriptLock().tryLock(10000)`を使う。
- ロック内で再取得・再検証する。
- 更新前範囲をメモリへ退避する。
- 書き込み後に整合性を検査する。
- 失敗時は今回追加行の削除または退避値への復元を試みる。
- 復元失敗時は重大ログを残し、以後の書き込みを停止できる管理フラグを設けることを検討する。

## 12. 履歴

- 支払いと送金バッチを共通の`occurred_at`へ正規化する。
- 支払いは`paid_at`、送金は`transferred_at`を使う。
- `ALL`は両配列をマージして20件返す。
- `PAYMENT`と`TRANSFER`は各種別だけを返す。
- カーソルは種別、日時、元行位置をBase64 URL化した不透明値とする。

## 13. 管理関数

| 関数 | 用途 |
| --- | --- |
| `setupSheets()` | 6シート作成 |
| `validateDatabase()` | 整合性検査 |
| `setAccessKey()` | キーのハッシュ保存 |
| `rotateAccessKey()` | キー更新 |
| `showConfigurationStatus()` | 設定有無確認 |

生キーをソースやログへ残さない。

## 14. セキュリティ

- CSPは`script-src 'self'`を基本とする。
- `connect-src`はGASに必要なドメインだけを許可する。
- 全Actionで最初に認証する。
- Action名と状態値を許可リストで検証する。
- Formula Injectionを防ぐため文字列をプレーンテキストとして保存する。
- 内部行番号、シートID、スタックトレースをAPIへ返さない。

## 15. テスト

### 単体

- 端数配分
- 自己負担の債務除外
- 支払者対象外
- 残債計算
- 支払い状態導出
- 直接債務集約
- FIFO部分充当
- 最適化ルート
- 最適化0送金相殺
- スナップショット決定性

### 結合

- 個別1組だけの精算
- 個別一部金額
- 複数支払いへのFIFO充当
- 個別精算の同時競合
- 最適化全ルート一括
- 最適化スナップショット競合
- 最新送金取消
- 取消後の残債復元
- 充当済み支払いの編集拒否
- 履歴の支払い・送金混在ページング

## 16. 開発・デプロイ

- フロントはGitHub ActionsでPagesへ配置する。
- GASは`clasp`で同期する。
- `.clasp.json`はGit管理しない。
- 開発・本番でスプレッドシート、GASデプロイ、キーを分ける。
- Service Workerによる業務データキャッシュは行わない。

## 17. 実装順

### Phase 1

- リポジトリ土台
- App Shell、認証
- GASルーター、シート初期化

### Phase 2

- 支払い作成・編集・取消
- 負担額計算

### Phase 3

- 残債計算
- 個別ルート
- FIFO充当
- 個別送金作成・取消

### Phase 4

- 最適化ルート
- スナップショット
- 最適化一括記録

### Phase 5

- 共通履歴
- エラー、アクセシビリティ
- 実機テスト

## 18. 完了条件

1. 6シート構成が定義と一致する。
2. 元の支払いを作り替えずに部分精算できる。
3. 個別送金額とFIFO充当合計が一致する。
4. 最適化送金の純収支と全残債充当が一致する。
5. 最新バッチ取消で残債が正しく戻る。
6. 全計算モジュールの単体テストが通る。
7. 同じ`request_id`で重複しない。
8. iPhone SafariとAndroid Chromeで主要操作を完了できる。
9. 生のアクセスキーがソース、ログ、Git履歴にない。

