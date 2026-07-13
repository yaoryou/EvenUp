# EvenUp スプレッドシート定義書

- 文書バージョン: 2.0
- 作成日: 2026-06-25
- 関連文書:
  - [要件定義書](./requirements.md)
  - [画面設計書](./screen-design.md)
  - [実装構成書](./implementation-architecture.md)
  - [API仕様書](./api-spec.md)

## 1. 共通ルール

- 1行目をカラム名とする。
- シート名、カラム名、カラム順は本書どおりに固定する。
- 日時はスプレッドシートの日付時刻値として保存する。
- タイムゾーンは`Asia/Tokyo`とする。
- 金額は日本円の整数とする。
- IDは文字列とし、新規発行はUUIDとする。
- データ行は原則物理削除しない。
- `status`を持たない支払い状態は関連データから導出する。

## 2. シート一覧

| シート | 役割 |
| --- | --- |
| `members` | メンバーマスター |
| `payments` | 元の支払い |
| `payment_shares` | 支払い対象者と確定負担額 |
| `transfer_batches` | 1回の精算操作 |
| `transfers` | 実際に行った送金 |
| `transfer_allocations` | 送金バッチから元債務への充当 |

旧案の`settlements`、`settlement_payments`、`settlement_transfers`は使用しない。

## 3. 関係

```text
members
  ├─ payments.paid_by
  ├─ payment_shares.member_id
  ├─ transfers.from_member_id
  └─ transfers.to_member_id

payments
  ├─ payment_shares.payment_id
  └─ transfer_allocations.payment_id

transfer_batches
  ├─ transfers.transfer_batch_id
  └─ transfer_allocations.transfer_batch_id
```

`transfer_allocations`は個別の送金行ではなく送金バッチへ紐付ける。最適化精算では、実送金と元債務が1対1対応しないためである。

## 4. `members`

| 順 | カラム | 型 | 必須 | 一意 | 説明 |
| ---: | --- | --- | :---: | :---: | --- |
| 1 | `member_id` | 文字列 | Yes | Yes | メンバーID |
| 2 | `name` | 文字列 | Yes | No | 表示名 |
| 3 | `active` | Boolean | Yes | No | 新規入力に表示するか |
| 4 | `sort_order` | 整数 | Yes | No | 表示順 |
| 5 | `created_at` | 日時 | Yes | No | 作成日時 |
| 6 | `updated_at` | 日時 | Yes | No | 更新日時 |

制約:

- `member_id`は変更しない。
- `name`は1〜50文字。同名を許可する。
- 利用終了時は削除せず`active=FALSE`とする。
- `sort_order`同値時は`member_id`昇順とする。

## 5. `payments`

| 順 | カラム | 型 | 必須 | 一意 | 説明 |
| ---: | --- | --- | :---: | :---: | --- |
| 1 | `payment_id` | 文字列 | Yes | Yes | 支払いID |
| 2 | `request_id` | 文字列 | Yes | Yes | 作成の二重実行防止ID |
| 3 | `paid_at` | 日時 | Yes | No | 支払い記録日時 |
| 4 | `description` | 文字列 | Yes | No | 内容 |
| 5 | `paid_by` | 文字列 | Yes | No | 支払者ID |
| 6 | `amount` | 整数 | Yes | No | 支払総額 |
| 7 | `cancelled_at` | 日時 | No | No | 取消日時 |
| 8 | `created_at` | 日時 | Yes | No | 作成日時 |
| 9 | `updated_at` | 日時 | Yes | No | 更新日時 |

制約:

- `description`は1〜100文字。
- `amount`は1〜99,999,999。
- `paid_by`は`members`に存在する。
- 新規作成時の`paid_by`は有効メンバーとする。
- `status`、`targets`、未精算繰越レコードは設けない。
- 有効な充当がある支払いは編集・取消できない。

## 6. `payment_shares`

| 順 | カラム | 型 | 必須 | 一意 | 説明 |
| ---: | --- | --- | :---: | :---: | --- |
| 1 | `payment_id` | 文字列 | Yes | 複合 | 支払いID |
| 2 | `member_id` | 文字列 | Yes | 複合 | 対象者ID |
| 3 | `share_amount` | 整数 | Yes | No | 確定負担額 |
| 4 | `created_at` | 日時 | Yes | No | 作成日時 |
| 5 | `updated_at` | 日時 | Yes | No | 更新日時 |

制約:

- `(payment_id, member_id)`を一意とする。
- 1支払いにつき1行以上必要とする。
- 支払いごとの合計は`payments.amount`と一致する。
- `share_amount`は0以上とする。
- `member_id = payments.paid_by`の行は自己負担であり、送金対象債務ではない。
- 支払い編集時だけ、対象支払いの行をロック内で置換できる。

## 7. `transfer_batches`

1回の「個別精算」または「まとめて最適化」の確定操作を表す。

| 順 | カラム | 型 | 必須 | 一意 | 説明 |
| ---: | --- | --- | :---: | :---: | --- |
| 1 | `transfer_batch_id` | 文字列 | Yes | Yes | 送金バッチID |
| 2 | `request_id` | 文字列 | Yes | Yes | 作成の二重実行防止ID |
| 3 | `mode` | 文字列 | Yes | No | `DIRECT` / `OPTIMIZED` |
| 4 | `transferred_at` | 日時 | Yes | No | 送金・相殺の実施日時 |
| 5 | `status` | 文字列 | Yes | No | `ACTIVE` / `CANCELLED` |
| 6 | `cancelled_at` | 日時 | No | No | 取消日時 |
| 7 | `created_at` | 日時 | Yes | No | 作成日時 |
| 8 | `updated_at` | 日時 | Yes | No | 更新日時 |

制約:

- `request_id`再送時は既存バッチを返す。
- `CANCELLED`から`ACTIVE`へ戻さない。
- `CANCELLED`では`cancelled_at`を必須とする。
- 取消可能なのは最新の`ACTIVE`バッチだけとする。
- `DIRECT`は表示用の送金・相殺行を1件固定で保存する。送金なし相殺では`amount=0`を許可する。
- `OPTIMIZED`は送金0件以上を許可する。

## 8. `transfers`

実際に行った送金ルート、または送金なし相殺の表示行を保存する。提案ルートは保存しない。

| 順 | カラム | 型 | 必須 | 一意 | 説明 |
| ---: | --- | --- | :---: | :---: | --- |
| 1 | `transfer_id` | 文字列 | Yes | Yes | 送金ID |
| 2 | `transfer_batch_id` | 文字列 | Yes | No | 送金バッチID |
| 3 | `from_member_id` | 文字列 | Yes | No | 送金者 |
| 4 | `to_member_id` | 文字列 | Yes | No | 受取者 |
| 5 | `amount` | 整数 | Yes | No | 実送金額。送金なし相殺では0 |
| 6 | `sort_order` | 整数 | Yes | No | バッチ内表示順 |
| 7 | `created_at` | 日時 | Yes | No | 作成日時 |

制約:

- 送金元と送金先は異なる。
- `amount`は0以上。通常送金は1以上、送金なし相殺だけ0を許可する。
- バッチ内の`sort_order`を一意とする。
- 親バッチが`CANCELLED`なら計算上無効とする。
- `DIRECT`バッチでは、2人間の残債を相殺した差額方向を送金元・先とする。逆方向残債への充当も同じバッチで許可する。

## 9. `transfer_allocations`

元債務のどこまでが精算されたかを保存する。

| 順 | カラム | 型 | 必須 | 一意 | 説明 |
| ---: | --- | --- | :---: | :---: | --- |
| 1 | `allocation_id` | 文字列 | Yes | Yes | 充当ID |
| 2 | `transfer_batch_id` | 文字列 | Yes | No | 送金バッチID |
| 3 | `payment_id` | 文字列 | Yes | 複合 | 元支払いID |
| 4 | `member_id` | 文字列 | Yes | 複合 | 債務者。`payment_shares.member_id` |
| 5 | `allocated_amount` | 整数 | Yes | No | 充当額 |
| 6 | `sort_order` | 整数 | Yes | No | FIFOまたは正規化順 |
| 7 | `created_at` | 日時 | Yes | No | 作成日時 |

制約:

- `(transfer_batch_id, payment_id, member_id)`を一意とする。
- `(payment_id, member_id)`は`payment_shares`に存在する。
- `member_id`は元支払いの`paid_by`と異なる。
- `allocated_amount`は1以上。
- `ACTIVE`バッチに属する同一債務への充当合計は`share_amount`を超えない。
- 親バッチが`CANCELLED`なら残債計算から除外する。
- `DIRECT`では、2人間の相殺後差額方向の残債に加え、逆方向残債を相殺分として同じバッチで充当できる。
- `OPTIMIZED`では作成時点の全残債を全額充当する。

## 10. 導出値

### 10.1 債務残額

```text
remaining_amount =
  payment_shares.share_amount
  - ACTIVEなtransfer_batchesに属するtransfer_allocationsの合計
```

ただし`payment_shares.member_id = payments.paid_by`は送金不要のため残債0円として扱う。

### 10.2 支払い状態

```text
settleable_amount =
  支払者本人以外のpayment_shares合計

allocated_amount =
  ACTIVEバッチのtransfer_allocations合計
```

| 条件 | 状態 |
| --- | --- |
| 支払い取消済み | `CANCELLED` |
| `settleable_amount = 0` | `SETTLED` |
| `allocated_amount = 0` | `UNSETTLED` |
| `allocated_amount < settleable_amount` | `PARTIALLY_SETTLED` |
| `allocated_amount = settleable_amount` | `SETTLED` |

## 11. データ整合性検査

1. 6シートと全ヘッダーが存在する。
2. ID、`request_id`、複合キーに重複がない。
3. 外部キー参照先が存在する。
4. 負担額合計が支払総額と一致する。
5. 取消済み支払いへ有効充当が存在しない。
6. 有効充当合計が元債務額を超えない。
7. `DIRECT`バッチの送金額と充当合計が一致する。
8. `DIRECT`の送金元・先と全充当先の債務関係が一致する。
9. `OPTIMIZED`バッチの送金による増減と充当債務の純収支が一致する。
10. 最新以外のバッチを取消していない。

不整合時は書き込みを停止する。複数シート更新では全検証後に更新前値を退避し、途中失敗時に復元する。

## 12. Script Properties

| キー | 内容 |
| --- | --- |
| `SPREADSHEET_ID` | 使用するスプレッドシートID |
| `ACCESS_KEY_SHA256` | アクセスキーのハッシュ |
| `API_VERSION` | APIバージョン |

## 13. 手動編集

- 原則として直接編集してよいのは`members`だけとする。
- その他5シートはアプリ経由で更新する。
- 行の並べ替え、物理削除、カラム変更を行わない。
- 閲覧用フィルタビューは利用できる。
