# EvenUp 本番環境セットアップ

## 1. 前提

- Googleアカウントへログイン済み
- Apps Script APIを有効化済み
- `npm install`済み

## 2. 共有アクセスキー

```bash
npm run secret:generate
```

`.evenup-production.json`へ生のアクセスキーとSHA-256ハッシュを保存する。このファイルはGit管理しない。

## 3. Google Apps Script

```bash
npm run gas:login
```

初回だけGoogleのOAuth認可を行う。

GASプロジェクトとスプレッドシートを作成後、`gas/.clasp.json`へ`scriptId`を設定する。

```bash
npm run gas:status
npm run gas:push
```

## 4. Script Properties

GASプロジェクトの設定で次を登録する。

| キー | 値 |
| --- | --- |
| `SPREADSHEET_ID` | 本番スプレッドシートID |
| `ACCESS_KEY_SHA256` | `.evenup-production.json`の`access_key_sha256` |
| `API_VERSION` | `v1` |

生のアクセスキーはGoogle側へ保存しない。

## 5. 初期化

Apps Scriptエディタから次を順に1回実行する。

1. `setupSheets`
2. `validateDatabase`

その後、`members`シートへ初期メンバーを登録する。

## 6. Webアプリ

- 実行ユーザー: 自分
- アクセスできるユーザー: 全員

デプロイURLを`frontend/js/config.js`へ設定し、`USE_DEMO_DATA`を`false`へ変更する。

## 7. 疎通確認

1. アクセスキー認証
2. テスト支払い登録
3. 個別精算
4. 精算取消
5. テスト支払い取消
6. `validateDatabase`再実行
