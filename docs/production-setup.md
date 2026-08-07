# EvenUp グループ別本番セットアップ

## 1. 構成

アプリのソースは1つだけ管理し、次の環境はグループごとに分離する。

- フロントエンドURL
- Google Apps ScriptプロジェクトとWebアプリデプロイ
- Googleスプレッドシート
- 共有アクセスキー

`config/groups.json`には公開可能な設定だけを置く。秘密情報は`.evenup-groups/<group-id>.json`へ保存し、Gitへ追加しない。

## 2. 既存グループの設定移行

従来の`.evenup-production.json`は`fate`（チンパン）用として引き続き読み込める。グループ別形式へコピーする場合は次を実行する。

```bash
npm run config:migrate -- fate
npm run gas:validate -- --group fate
```

コピー後も旧ファイルは自動削除しない。新設定の確認が完了してから手動で保管または削除する。

既存グループの表示名は`チンパン`、グループIDは`fate`である。

## 3. 新しいグループの追加

### 3.1 公開設定

`config/groups.example.json`を参考に、`config/groups.json`へ一意な設定を追加する。

```json
{
  "id": "nko",
  "name": "NKO",
  "path": "nko",
  "api_url": "",
  "use_demo_data": false,
  "enabled": false,
  "default": false,
  "migrate_legacy_storage": false,
  "legacy_environment": false
}
```

`id`と`path`には小文字英数字とハイフンを使用する。`migrate_legacy_storage`と`legacy_environment`を有効にするのは従来利用者がいる`fate`だけとする。

新規グループは`enabled: false`で準備し、GAS WebアプリURLの設定と疎通確認が完了してから`true`へ変更する。無効なグループはGitHub Pagesと`gas:deploy:all`の対象にならない。

公開後の`id`は端末保存の名前空間、`path`は利用URLになるため変更しない。

### 3.2 共有アクセスキー

```bash
npm run secret:generate -- nko
```

生のアクセスキーとSHA-256ハッシュが`.evenup-groups/nko.json`へ保存される。このアクセスキーはグループID`nko`とは別の認証情報である。ファイルをメッセージやGitで共有しない。

### 3.3 Google側の環境

グループ専用のGoogle Sheetと、それに紐づくGASプロジェクトを同時に作成する。対象グループが`enabled: false`で、秘密設定の`script_id`と`spreadsheet_id`が空の場合だけ実行できる。

```bash
npm run group:create-google -- --group nko
```

GASプロジェクトのScript Propertiesへ次を登録する。

| キー | 値 |
| --- | --- |
| `SPREADSHEET_ID` | グループ専用スプレッドシートID |
| `ACCESS_KEY_SHA256` | 秘密設定の`access_key_sha256` |
| `API_VERSION` | `v1` |

コードを反映する。

```bash
npm run gas:status -- --group nko
npm run gas:push -- --group nko --force
```

新規GASの初回反映だけは、作成時の空テンプレートを置き換えるため`--force`を指定する。以後の更新では通常の`gas:push`または`gas:deploy`を使う。

Apps Scriptエディタから`setupSheets`、`validateDatabase`を順に1回実行し、`members`シートへメンバーを登録する。固定メンバー投入関数は使用しない。

初回のWebアプリデプロイを作成し、表示されたURLを`config/groups.json`の`api_url`へ登録してからグループを有効化する。

```bash
npm run group:create-deployment -- --group nko
```

### 3.4 Webアプリ

- 実行ユーザー: 自分
- アクセスできるユーザー: 全員

Webアプリを初回デプロイしたら、デプロイIDとURLを秘密設定へ保存する。

```bash
node scripts/update-production-config.mjs nko deployment_id DEPLOYMENT_ID
node scripts/update-production-config.mjs nko web_app_url WEB_APP_URL
```

同じURLを`config/groups.json`の`api_url`へ設定し、疎通確認後に`enabled`を`true`へ変更する。

## 4. 検証と配布

```bash
npm run gas:validate
npm run check
npm test
npm run build
```

`dist/<group-path>/`へ有効なグループのフロントエンドが生成される。`main`ブランチへpushするとGitHub Actionsが検証と生成を行い、GitHub Pagesへ配置する。

本番GASの更新は、変更をコミットして作業ツリーをクリーンにした後で実行する。

```bash
npm run gas:deploy -- --group nko
npm run gas:deploy:all
```

一括更新は途中で失敗した時点で停止し、更新済みグループを表示する。原因を解消後、同じコミットから再実行する。

## 5. 疎通確認

グループを指定してブラウザ用スモークテストを起動する。

```bash
npm run smoke:production -- --group nko
```

続けて実機で次を確認する。

1. 専用URLとグループ名
2. アクセスキー認証
3. テスト支払い登録
4. 個別精算
5. 精算取消
6. テスト支払い取消
7. `validateDatabase`の成功

## 6. ロールバック

- フロントエンド: 直前の正常なGitコミットを再配布する。
- GAS: 各GASプロジェクトの直前バージョンへデプロイを戻す。
- スプレッドシート: この改修ではシート構造を変更しないため、グループ対応だけを理由とするデータ移行は不要。
