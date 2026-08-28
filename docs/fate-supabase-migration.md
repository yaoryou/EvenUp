# チンパン Supabase移行

## 方針

チンパンはNKOと同じSupabaseプロジェクト、認証、テーブル、RLS、RPCを利用する。すべての業務データと権限は`group_id = 'fate'`でNKOから分離する。

## 既存データ

GASの読み取り専用スナップショットを`npm run migration:export-fate`で取得する。スナップショットはチェックサム、列構造、UUID、参照関係、支払額と負担額、精算充当上限を検証し、`.evenup-migration/fate/`へ所有者限定で保存する。

## 適用順序

1. `supabase/migrations/202608280001_fate_group.sql`でグループと既存メンバーを登録する。
2. `supabase/verification/202608280001_fate_group_check.sql`でグループ、メンバー、空の台帳を検証する。
3. 認証ユーザーを正しいチンパンメンバーへ紐付け、ナカチを`ADMIN`、シャ卿とチンピラを`MEMBER`にする。
4. 最新スナップショットから生成した`dry-run-*.sql`を実行し、ロールバック後の件数が0であることを確認する。
5. 最新スナップショットから生成した`import-*.sql`を実行し、件数とチェックサムを確認する。
6. GitHub PagesのチンパンをSupabaseへ切り替え、読み取り・書き込み・権限制御を確認する。
7. 公開確認後にチンパンGASを完全削除し、スプレッドシートだけを保持する。

ユーザーのメールアドレス、パスワード、Auth UUIDはGitへ保存しない。
