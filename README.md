# EvenUp

身内向けの割り勘・部分精算管理モバイルWebアプリです。

## ローカル確認

```bash
npm run serve
```

ブラウザで`http://localhost:4173`を開きます。`config/groups.json`に定義した既定グループへ移動します。

## 検証

```bash
npm run check
npm test
```

## ディレクトリ

- `frontend/`: グループ別フロントエンドの共通ソース
- `config/`: 公開可能なグループ設定
- `dist/`: GitHub Pagesへ配置する生成物（Git管理外）
- `gas/`: Google Apps Script Webアプリ
- `tests/`: Node標準テスト
- `docs/`: 要件・画面・API・シート・実装設計

## グループ設定

- 公開可能な表示名・URL: `config/groups.json`
- アクセスキーやGASプロジェクトID: `.evenup-groups/<group-id>.json`（Git管理外）
- フロントエンド生成: `npm run build`
- 全GASへの一括反映: `npm run gas:deploy:all`

コードは共通で、GASプロジェクト、スプレッドシート、アクセスキーはグループごとに分離します。
`enabled: false`の準備中グループは、GitHub Pagesと一括GAS配布の対象外です。

## 実装済み機能

- 支払い作成・編集・取消
- 支払者を端数配分で優遇する負担額計算
- 個別精算と一部金額のFIFO充当
- 全残債の最適化精算
- 最新の精算記録取消
- 支払い・送金の統合履歴と20件ページング
- 共有アクセスキー認証、冪等ID、ScriptLock

デモ環境を追加する場合は、そのグループ設定の`use_demo_data`を`true`にし、`api_url`を空にします。

設計の入口は[docs/README.md](./docs/README.md)です。
本番接続手順は[docs/production-setup.md](./docs/production-setup.md)です。
