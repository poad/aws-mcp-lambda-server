# AGENTS.md

このリポジトリでエージェントが守るべきルール・コマンド一覧です。

## ビルド・Lint・テストコマンド

- 全体ビルド: `pnpm -r --parallel --if-present build`
- Lint: `pnpm -r --parallel --if-present lint`
- Lint自動修正: `pnpm -r --parallel --if-present lint-fix`
- platformテスト: `pnpm --filter platform test`（単一テストは `vitest run path/to/test.ts`）
- client開発: `pnpm --filter client dev`

## コードスタイル・規約

- インデントはスペース2、LF改行、UTF-8、ファイル末尾に改行
- セミコロン必須、シングルクオート、複数行カンマ必須
- アロー関数は常に括弧
- 型は厳格（noImplicitAny, strict, strictNullChecks）、any/unknown禁止
- ライブラリ提供のクラス以外のクラスは原則禁止（Error継承など必要時のみ）
- importはtypescript/node解決、内部パスは`^~/`や`@/*`を使用
- エラー処理はtry/catch、Promiseはeslint-plugin-promise推奨
- 命名はキャメルケース、型はパスカルケース
- ハードコーディング禁止（必要時のみ）
- コードの自動整形はeslint, editorconfigに従う
- Markdownはmarkdownlint-cli2に従う
- 依存関係の更新はdependabotで行われるが、`pnpm up -r`での更新は可
- `pnpm audit` による依存パッケージの脆弱性チェック実施は必須
- 変数の破壊的再代入は禁止

## セキュリティベストプラクティス

- **認証情報のハードコーディング禁止**
  - APIキー、シークレットキー、パスワード等は環境変数やAWS Secrets Manager、Parameter Store等から取得する。開発環境では`.env`ファイルを使用可能だが、`.gitignore`に含めコミットしない。本番環境では環境変数またはAWSのマネージドサービスを使用する。
  - 静的解析ツール（例：`git-secrets`, `truffleHog`）を使用してコミット前に認証情報の漏洩を検出する。
- **入力検証**
  - 外部から受け取る全データは型チェック・バリデーションを行う。`zod`や`yup`等を活用し、数値・文字列・日付の形式・範囲を明示的に検証する。
- **出力エスケープ**
  - HTML/JSONなどクライアントへ返すデータは適切にエスケープし、XSS攻撃を防止。フロントエンドでもサニタイズライブラリを活用する。
- **最小権限の原則**
  - IAMロール・ポリシーは必要最低限の権限のみ付与し、過剰な権限付与を避ける。Lambda関数やEC2インスタンスに付与するロールはスコープを絞る。
- **依存関係の安全性**
  - 定期的に `pnpm audit` を実行し、脆弱性が報告されたパッケージは即時更新する。`dependabot` のプルリクエストを活用する。
- **秘密情報のロギング回避**
  - エラーログやデバッグログに認証情報・個人情報を含めない。ログ出力時はマスク処理やフィルタリングを実装する。
- **コードレビューと自動テスト**
  - セキュリティチェック（Static Analysis, SAST）を CI に組み込み、プルリクエスト時に自動的に検証する。ユニットテスト・統合テストで入力検証ロジックを網羅的にテストする。

## 備考

- ルール追加時は本ファイルを更新してください
