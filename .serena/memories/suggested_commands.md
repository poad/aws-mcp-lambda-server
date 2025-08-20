# 推奨コマンド

## 開発コマンド

### ビルド・テスト
```bash
# プロジェクト全体のビルド
pnpm run build

# platform配下のビルド
cd platform && pnpm run build

# テスト実行
pnpm run test
cd platform && pnpm run test
```

### 開発サーバー
```bash
# MCPサーバーの開発サーバー起動
cd platform && pnpm run dev
```

### リンティング・フォーマット
```bash
# ESLint実行
pnpm run lint
cd platform && pnpm run lint

# ESLint自動修正
pnpm run lint-fix
cd platform && pnpm run lint-fix
```

### デプロイ
```bash
# AWS環境へのデプロイ
cd platform && npx cdk deploy --all

# 設定オプション付きデプロイ
npx cdk deploy -c project-name=my-mcp-server
npx cdk deploy -c use-auth=true
npx cdk deploy -c domain=my-domain
```

### CDK関連
```bash
# CDKスタックの確認
cd platform && npx cdk list

# 差分確認
cd platform && npx cdk diff

# CDKブートストラップ（初回のみ）
cd platform && npx cdk bootstrap
```

## システムコマンド（macOS）
```bash
# ファイル検索
find . -name "*.ts" -type f
grep -r "pattern" .

# ディレクトリ操作
ls -la
cd path/to/directory

# Git操作
git status
git add .
git commit -m "message"
git push
```