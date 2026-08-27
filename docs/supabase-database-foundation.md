# NKO Supabase DB基盤

## 目的

既存のNKO GAS版を維持したまま、Supabase PostgreSQL側へ認証ユーザー、メンバー、支払い、精算、操作履歴の保存先とアクセス制御を準備する。

この段階ではGitHub PagesのNKO本体をSupabase DBへ切り替えない。

## 認証ユーザーと会計メンバー

Supabase Authのユーザーと、支払い計算で使うNKOメンバーは別の概念として保存する。

- `auth.users`: メールアドレス、パスワードハッシュ、認証セッション
- `evenup_members`: `M001`などの会計上のメンバー
- `evenup_group_memberships`: Authユーザーと会計メンバーの紐付け、権限、利用可否

会計メンバーは、ログインアカウントを持たない状態を許可する。1グループ内で、1ユーザーと1会計メンバーはそれぞれ最大1件だけ紐付けられる。

## テーブル

| テーブル | 用途 |
| --- | --- |
| `evenup_groups` | グループ |
| `evenup_members` | 会計メンバー |
| `evenup_group_memberships` | Authユーザー、会計メンバー、権限の紐付け |
| `evenup_payments` | 支払い |
| `evenup_payment_shares` | 確定負担額 |
| `evenup_transfer_batches` | 1回の精算操作 |
| `evenup_transfers` | 実際の送金ルート |
| `evenup_transfer_allocations` | 元債務への充当 |
| `evenup_audit_events` | 操作履歴 |

すべての業務テーブルは`group_id`を持つ。NKOの`group_id`は`nko`で固定する。

## 権限

- 未ログインユーザーにはテーブル権限を付与しない。
- 有効なNKOユーザーは、残高計算に必要なNKO内のメンバー・支払い・精算を閲覧できる。
- 一般ユーザーが参照できる紐付け情報は自分の行だけとする。
- 管理者はNKO内の全紐付け情報と操作履歴を閲覧できる。
- 一般ユーザーは自分の操作履歴を閲覧できる。
- ブラウザにはテーブルの`INSERT`、`UPDATE`、`DELETE`権限を付与しない。
- 書き込みは、入力検証、所有者確認、冪等性、複数テーブル更新を一つのトランザクションで行う専用RPCだけに許可する。
- 物理削除用RPCは作成しない。

一般ユーザーが編集・取消できる「自分の記録」は、`created_by_user_id = auth.uid()`の記録と定義する。支払者`paid_by`とは別である。管理者は他ユーザーが作成した記録も管理できる。

## 利用停止

通常の利用停止ではAuthユーザーを削除せず、`evenup_group_memberships.active`を`false`にする。すべての閲覧RLSと今後作る書き込みRPCは、毎回この値を確認する。

これによりブラウザに有効期限内のJWTが残っていても、業務データへアクセスできなくなる。

## 適用ファイル

1. `supabase/migrations/202608270001_nko_foundation.sql`
2. `supabase/migrations/202608270002_nko_members.sql`
3. `supabase/migrations/202608270003_nko_payment_rpcs.sql`
4. `supabase/migrations/202608270004_nko_ledger_lock.sql`
5. `supabase/migrations/202608270005_nko_settlement_rpcs.sql`
6. `supabase/verification/202608270001_nko_foundation_check.sql`
7. `supabase/verification/202608270003_nko_payment_rpcs_check.sql`
8. `supabase/verification/202608270005_nko_settlement_rpcs_check.sql`
9. `supabase/templates/provision-first-admin.sql`

1はテーブル・制約・索引・RLS・権限・NKOグループを作成する。2は既存スプレッドシートのNKOメンバー4名を同じIDで登録する。3は支払い作成・編集・取消のトランザクションRPCを追加し、4は支払いと精算の同時更新をグループ単位で直列化し、5は個別精算・最適化精算・最新精算取消RPCを追加する。6はRLSとテーブル権限、7は支払いRPCの実行権限・二重処理防止・制約、8は精算RPCと台帳ロックの実行権限を検査する。9はテストユーザーを最初の管理者へ紐付けるためのテンプレートである。

ユーザーUUIDやメールアドレスはGitへ保存しない。

## 次の段階

DB基盤の適用と最初の管理者の紐付け後、以下を実装する。

1. 初期表示・履歴取得RPC
2. Google Sheetからのデータ変換と照合
3. NKOフロントエンドのAPI切り替え

## スプレッドシートデータの移行

GASの`migration.export_snapshot`は既存アクセスキーで認証した場合だけ、6シートを読み取り専用スナップショットとして返す。ローカルの`npm run migration:export-nko`は次を自動実行する。

1. スナップショットのSHA-256チェックサムを照合する。
2. UUID、日時、金額、重複、参照関係、支払額と負担額の一致、精算充当上限を検査する。
3. `.evenup-migration/nko/`へスナップショットと一括取込SQLを保存する。

`.evenup-migration/`はGit管理外で、生成ファイルの権限は所有者のみに制限する。取込SQLはNKOに有効な管理者が1名だけ存在し、支払い・精算データが空の場合にだけ実行できる。グループ単位の台帳ロックと1トランザクションで処理し、最後に件数と支払額を照合する。初回の試験抽出ではSupabaseへ書き込まず、切替直前に最終スナップショットを再取得して取り込む。
