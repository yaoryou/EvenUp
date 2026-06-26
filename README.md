# EvenUp

身内向けの割り勘・部分精算管理モバイルWebアプリです。

## ローカル確認

```bash
npm run serve
```

ブラウザで`http://localhost:4173`を開きます。初期状態ではAPI URLが未設定のため、デモデータで画面を確認できます。

## 検証

```bash
npm run check
npm test
```

## ディレクトリ

- `frontend/`: GitHub Pagesへ配置する静的アプリ
- `gas/`: Google Apps Script Webアプリ
- `tests/`: Node標準テスト
- `docs/`: 要件・画面・API・シート・実装設計

## API設定

本番接続時は`frontend/js/config.js`の`API_URL`へGAS WebアプリURLを設定し、`USE_DEMO_DATA`を`false`へ変更します。

## 実装済み機能

- 支払い作成・編集・取消
- 支払者を端数配分で優遇する負担額計算
- 個別精算と一部金額のFIFO充当
- 全残債の最適化精算
- 最新の精算記録取消
- 支払い・送金の統合履歴と20件ページング
- 共有アクセスキー認証、冪等ID、ScriptLock

`frontend/js/config.js`は初期状態でデモモードです。GAS接続前でも一連の操作を確認できます。

設計の入口は[docs/README.md](./docs/README.md)です。
本番接続手順は[docs/production-setup.md](./docs/production-setup.md)です。
