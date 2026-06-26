# EvenUp API仕様書

- 文書バージョン: 2.0
- 作成日: 2026-06-25
- APIバージョン: `v1`
- 関連文書:
  - [要件定義書](./requirements.md)
  - [画面設計書](./screen-design.md)
  - [実装構成書](./implementation-architecture.md)
  - [スプレッドシート定義書](./sheet-schema.md)

## 1. 通信

```text
POST https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec
Content-Type: text/plain;charset=UTF-8
Body: JSON文字列
Response: application/json
```

読み取り・書き込みともPOSTへ統一する。クライアントはGAS Content Serviceのリダイレクトを追跡する。

## 2. 共通リクエスト

```json
{
  "api_version": "v1",
  "action": "bootstrap",
  "access_key": "共有アクセスキー",
  "request_id": null,
  "payload": {}
}
```

| フィールド | 必須 | 説明 |
| --- | :---: | --- |
| `api_version` | Yes | `v1` |
| `action` | Yes | 操作名 |
| `access_key` | Yes | 共有アクセスキー |
| `request_id` | 操作依存 | 作成の冪等性またはログ相関用UUID |
| `payload` | Yes | 操作固有データ |

## 3. 共通レスポンス

成功:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "api_version": "v1",
    "request_id": null,
    "server_time": "2026-06-25T12:34:56+09:00"
  }
}
```

失敗:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容を確認してください。",
    "fields": {},
    "retryable": false
  },
  "meta": {
    "api_version": "v1",
    "request_id": null,
    "server_time": "2026-06-25T12:34:56+09:00"
  }
}
```

クライアントはHTTPステータスではなく`ok`を判定する。

## 4. 共通モデル

### 4.1 Payment

```json
{
  "payment_id": "uuid",
  "paid_at": "2026-06-25T12:34:56+09:00",
  "description": "ラーメン",
  "paid_by": "M001",
  "amount": 1000,
  "status": "PARTIALLY_SETTLED",
  "settleable_amount": 667,
  "allocated_amount": 300,
  "remaining_amount": 367,
  "cancelled_at": null,
  "updated_at": "2026-06-25T12:34:56+09:00",
  "shares": [
    {
      "member_id": "M001",
      "share_amount": 333,
      "allocated_amount": 0,
      "remaining_amount": 0
    },
    {
      "member_id": "M002",
      "share_amount": 334,
      "allocated_amount": 300,
      "remaining_amount": 34
    },
    {
      "member_id": "M003",
      "share_amount": 333,
      "allocated_amount": 0,
      "remaining_amount": 333
    }
  ]
}
```

支払い状態:

- `UNSETTLED`
- `PARTIALLY_SETTLED`
- `SETTLED`
- `CANCELLED`

### 4.2 DirectRoute

```json
{
  "route_key": "base64url",
  "from_member_id": "M002",
  "to_member_id": "M001",
  "remaining_amount": 1334,
  "debts": [
    {
      "payment_id": "uuid",
      "description": "ラーメン",
      "paid_at": "2026-06-20T12:00:00+09:00",
      "remaining_amount": 334
    }
  ]
}
```

### 4.3 OptimizedRoute

```json
{
  "from_member_id": "M002",
  "to_member_id": "M001",
  "amount": 800,
  "sort_order": 1
}
```

### 4.4 TransferBatch

```json
{
  "transfer_batch_id": "uuid",
  "mode": "DIRECT",
  "transferred_at": "2026-06-25T20:00:00+09:00",
  "status": "ACTIVE",
  "cancelled_at": null,
  "transfers": [
    {
      "transfer_id": "uuid",
      "from_member_id": "M002",
      "to_member_id": "M001",
      "amount": 1000,
      "sort_order": 1
    }
  ],
  "allocations": [
    {
      "payment_id": "uuid",
      "member_id": "M002",
      "allocated_amount": 334,
      "sort_order": 1
    }
  ]
}
```

## 5. Action一覧

| Action | 用途 | `request_id` | ロック |
| --- | --- | :---: | :---: |
| `auth.verify` | キー検証 | 不要 | No |
| `bootstrap` | 初期データ | 不要 | No |
| `payments.create` | 支払い作成 | 必須 | Yes |
| `payments.update` | 支払い編集 | 必須 | Yes |
| `payments.cancel` | 支払い取消 | 必須 | Yes |
| `history.list` | 支払い・送金履歴 | 不要 | No |
| `settlement.preview` | 両方式の最新候補 | 不要 | No |
| `transfers.create_direct` | 個別送金記録 | 必須 | Yes |
| `transfers.create_optimized` | 最適化送金一括記録 | 必須 | Yes |
| `transfers.cancel_latest` | 最新送金バッチ取消 | 必須 | Yes |

## 6. `auth.verify`

Payload:

```json
{}
```

Response:

```json
{
  "authenticated": true
}
```

## 7. `bootstrap`

Payload:

```json
{}
```

Response:

```json
{
  "members": [],
  "open_payments": [],
  "balances": [],
  "direct_routes": [],
  "optimized_routes": [],
  "optimized_snapshot_token": "sha256-base64url",
  "latest_cancellable_transfer_batch": null
}
```

- `open_payments`は`UNSETTLED`または`PARTIALLY_SETTLED`。
- `direct_routes`は直接債務を債務者・受取者で集約した候補。
- `optimized_routes`は全残債を純収支化した候補。
- `optimized_snapshot_token`は最適化一括記録の競合検知に使う。

## 8. `payments.create`

```json
{
  "description": "ラーメン",
  "amount": 1000,
  "paid_by": "M001",
  "target_member_ids": ["M001", "M002", "M003"]
}
```

- 作成`request_id`は必須。
- 同じ`request_id`では既存支払いと`idempotent_replay=true`を返す。
- 応答は作成後のPaymentとする。

## 9. `payments.update`

```json
{
  "payment_id": "uuid",
  "expected_updated_at": "2026-06-25T12:34:56+09:00",
  "description": "ラーメン・餃子",
  "amount": 1300,
  "paid_by": "M001",
  "target_member_ids": ["M001", "M002", "M003"]
}
```

条件:

- 支払いが存在し、取消済みでない。
- 有効充当額が0円である。
- `updated_at`が一致する。

成功時は負担額を再計算して置換する。

## 10. `payments.cancel`

```json
{
  "payment_id": "uuid",
  "expected_updated_at": "2026-06-25T12:34:56+09:00"
}
```

条件:

- 取消済みでない。
- 有効充当額が0円である。
- `updated_at`が一致する。

取消後のPaymentを返す。

## 11. `settlement.preview`

現在の残債から両方の精算候補を再計算する。

```json
{}
```

Response:

```json
{
  "open_payments": [],
  "balances": [],
  "direct_routes": [],
  "optimized_routes": [],
  "optimized_snapshot_token": "sha256-base64url",
  "latest_cancellable_transfer_batch": null
}
```

スナップショット材料:

- 残債がある`payment_id`
- `payments.updated_at`
- 債務者`member_id`
- 元債権者`paid_by`
- 元負担額
- 有効充当合計
- 残債

ID順に正規化し、SHA-256 Base64 URL形式で生成する。

## 12. `transfers.create_direct`

選択した直接債務へ実送金を記録する。

Payload:

```json
{
  "route_key": "base64url",
  "from_member_id": "M002",
  "to_member_id": "M001",
  "amount": 1000
}
```

処理:

1. ScriptLockを取得する。
2. 同じ`request_id`のバッチがあれば既存結果を返す。
3. 最新残債から同じ送金元・先の直接債務を再構築する。
4. `route_key`と送金元・先を検証する。
5. 金額が1円以上、最新グループ残債以下であることを確認する。
6. 古い`paid_at`、同時刻`payment_id`順にFIFO充当を作る。
7. `DIRECT`バッチ、送金1件、充当行を保存する。
8. 事後整合性を検査する。

Response:

```json
{
  "transfer_batch": {},
  "idempotent_replay": false,
  "preview": {}
}
```

表示後に残債が減り、指定額を充当できない場合は`DIRECT_ROUTE_CONFLICT`を返す。

## 13. `transfers.create_optimized`

表示中の全最適化ルートを一括で記録する。

Payload:

```json
{
  "snapshot_token": "sha256-base64url"
}
```

処理:

1. ScriptLockを取得する。
2. 同じ`request_id`のバッチがあれば既存結果を返す。
3. 最新残債とスナップショットを再計算する。
4. トークン不一致なら処理を停止する。
5. 最適化ルートをサーバー側で再計算する。
6. `OPTIMIZED`バッチを作る。
7. 表示対象の全ルートを`transfers`へ保存する。
8. 作成時点の全残債を`transfer_allocations`へ全額保存する。
9. 送金による増減と残債純収支の一致を検査する。

クライアントからルート配列や任意金額は受け取らない。

Response:

```json
{
  "transfer_batch": {},
  "idempotent_replay": false,
  "preview": {}
}
```

残債がない場合は`NO_OPEN_DEBTS`を返す。

## 14. `transfers.cancel_latest`

Payload:

```json
{
  "transfer_batch_id": "uuid"
}
```

処理:

1. 最新の`ACTIVE`バッチを取得する。
2. 指定IDと一致することを確認する。
3. 親バッチを`CANCELLED`にする。
4. 配下の送金・充当は変更しない。
5. 最新プレビューを返す。

指定バッチが最新でなければ`TRANSFER_BATCH_NOT_LATEST`を返す。

同じ取消の再送で既に取消済みなら、対象を特定できる場合に限り成功として返してよい。

## 15. `history.list`

Payload:

```json
{
  "type": "ALL",
  "cursor": null,
  "limit": 20
}
```

`type`:

- `ALL`
- `PAYMENT`
- `TRANSFER`

Response:

```json
{
  "items": [],
  "next_cursor": "opaque-cursor",
  "has_more": true
}
```

共通履歴は`occurred_at`降順とする。カーソルは種別、日時、元シート行位置を含む不透明値とし、クライアントは解析しない。

支払い履歴には導出済み状態と負担・残債を含める。送金履歴にはモード、送金、充当内訳、取消状態を含める。

## 16. エラーコード

| コード | 意味 | 再試行 |
| --- | --- | :---: |
| `INVALID_JSON` | JSON不正 | No |
| `UNSUPPORTED_API_VERSION` | APIバージョン不正 | No |
| `UNAUTHORIZED` | キー不正 | No |
| `UNKNOWN_ACTION` | Action不正 | No |
| `VALIDATION_ERROR` | 入力不正 | No |
| `MEMBER_NOT_FOUND` | メンバーなし | No |
| `MEMBER_INACTIVE` | 無効メンバー | No |
| `PAYMENT_NOT_FOUND` | 支払いなし | No |
| `PAYMENT_HAS_ALLOCATIONS` | 支払いに有効充当あり | No |
| `EDIT_CONFLICT` | 支払い更新競合 | No |
| `NO_OPEN_DEBTS` | 残債なし | No |
| `DIRECT_ROUTE_CONFLICT` | 個別候補が表示後に変化 | No |
| `SNAPSHOT_CONFLICT` | 最適化候補が表示後に変化 | No |
| `TRANSFER_BATCH_NOT_FOUND` | 送金バッチなし | No |
| `TRANSFER_BATCH_NOT_LATEST` | 最新バッチでない | No |
| `DATA_INTEGRITY_ERROR` | データ不整合 | No |
| `LOCK_TIMEOUT` | ロック取得失敗 | Yes |
| `RATE_LIMITED` | 利用制限 | Yes |
| `INTERNAL_ERROR` | 内部エラー | 状況依存 |

`UNAUTHORIZED`では端末内キーを削除する。競合系では最新プレビューを再取得し、自動で送金記録し直さない。

## 17. フロント通信例

```js
async function callApi(action, payload = {}, requestId = null) {
  const response = await fetch(API_URL, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8"
    },
    body: JSON.stringify({
      api_version: "v1",
      action,
      access_key: localStorage.getItem("evenup_access_key"),
      request_id: requestId,
      payload
    })
  });

  const result = await response.json();
  if (!result.ok) throw result.error;
  return result.data;
}
```

## 18. ログ・互換性

- ログには`request_id`、Action、処理時間、結果、エラーコード、対象IDだけを残す。
- 生キーとリクエスト本文全体を記録しない。
- `v1`内で既存フィールドを削除・型変更しない。
- 破壊的変更時はAPIバージョンを更新する。

