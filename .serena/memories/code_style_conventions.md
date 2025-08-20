# コードスタイル・規約

## TypeScript設定
- **Target**: esnext
- **Module**: esnext (ES Modules)
- **Module Resolution**: bundler
- **Strict Mode**: 有効
- **Declaration**: 有効

## ESLint設定
- **Base**: @eslint/js recommended + typescript-eslint strict
- **Style**: @stylistic/eslint-plugin
- **Import**: eslint-plugin-import
- **Promise**: eslint-plugin-promise

### 主要ルール
- セミコロン: 必須 (`@stylistic/semi: ['error', 'always']`)
- インデント: 2スペース (`@stylistic/ts/indent: ['error', 2]`)
- 末尾カンマ: 複数行で必須 (`@stylistic/comma-dangle: ['error', 'always-multiline']`)
- アロー関数の括弧: 必須 (`@stylistic/arrow-parens: ['error', 'always']`)
- クォート: シングルクォート (`@stylistic/quotes: ['error', 'single']`)

## 命名規約
- **ファイル名**: kebab-case (例: `mcp-server.ts`)
- **変数・関数**: camelCase
- **定数**: UPPER_SNAKE_CASE
- **型・インターフェース**: PascalCase
- **クラス**: PascalCase

## Import規約
- **ES Modules**: `import` / `export` を使用
- **相対パス**: `./` または `../` で開始
- **Node.js組み込み**: `node:` プレフィックス使用 (例: `import path from 'node:path'`)
- **外部ライブラリ**: パッケージ名で直接import

## ファイル構成
- **エントリーポイント**: `index.ts`
- **設定ファイル**: プロジェクトルートまたは各ディレクトリ
- **ツール**: `tools/` ディレクトリに配置
- **ユーティリティ**: `utils.ts`

## コメント
- **JSDoc**: 公開関数・クラスに記述
- **インライン**: 複雑なロジックに説明を追加
- **TODO**: `// TODO: 説明` 形式