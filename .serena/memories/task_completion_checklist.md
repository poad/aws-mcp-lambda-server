# タスク完了時の実行項目

## 必須チェック項目

### 1. ビルド確認
```bash
cd platform && pnpm run build
```
- TypeScriptコンパイルエラーがないことを確認
- 型チェックが通ることを確認

### 2. リンティング
```bash
cd platform && pnpm run lint
```
- ESLintエラーがないことを確認
- コードスタイルが規約に準拠していることを確認

### 3. 自動修正（必要に応じて）
```bash
cd platform && pnpm run lint-fix
```
- 自動修正可能なESLintエラーを修正

### 4. テスト実行
```bash
cd platform && pnpm run test
```
- 既存テストが通ることを確認
- 新機能にテストが追加されていることを確認

### 5. 動作確認
```bash
cd platform && pnpm run dev
```
- 開発サーバーが正常に起動することを確認
- 新機能が期待通り動作することを確認

## 推奨チェック項目

### 6. CDK差分確認（インフラ変更時）
```bash
cd platform && npx cdk diff
```
- インフラ変更が意図通りであることを確認

### 7. セキュリティチェック
- 機密情報がハードコードされていないことを確認
- 環境変数が適切に使用されていることを確認

### 8. ドキュメント更新
- README.mdの更新（必要に応じて）
- コメント・JSDocの追加・更新

## Git操作
```bash
git add .
git commit -m "descriptive commit message"
git push
```

## 注意事項
- 全てのチェックが通ってからコミット・プッシュする
- エラーが発生した場合は必ず修正してから次に進む
- 大きな変更の場合は段階的にコミットする