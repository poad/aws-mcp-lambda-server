# AWS MCP Lambda Server

AWS Lambda上で動作するModel Context Protocol (MCP) サーバーの実装です。このプロジェクトは、MCPサーバーをAWSのサーバーレス環境で実行し、Claude DesktopなどのMCPクライアントと連携できるようにします。

## プロジェクト構成

```text
aws-mcp-lambda-server/
├── platform/                    # AWS CDKインフラストラクチャとLambda関数
│   ├── bin/                     # CDKアプリケーションエントリーポイント
│   ├── lib/                     # CDKスタック定義
│   ├── lambda/                  # Lambda関数のソースコード
│   │   ├── mcp-server/         # MCPサーバー実装
│   │   │   ├── tools/          # MCPツール（WeatherTool等）
│   │   │   ├── index.ts        # Lambda関数エントリーポイント
│   │   │   ├── mcp-server.ts   # MCPサーバー設定
│   │   │   └── server.ts       # 開発用サーバー
│   │   ├── authorize.ts        # OAuth認証処理
│   │   ├── token.ts           # トークン管理
│   │   ├── revoke.ts          # トークン無効化
│   │   ├── clients.ts         # クライアント管理
│   │   └── utils.ts           # ユーティリティ関数
│   └── package.json
├── example/                     # サンプルクライアントアプリケーション
│   └── client/                 # Next.jsベースのWebクライアント
│       ├── src/                # クライアントソースコード
│       └── package.json
├── .github/workflows/          # GitHub Actions CI/CD設定
│   ├── ci.yml                 # ビルド・テスト
│   ├── deploy.yml             # AWS デプロイ
│   ├── codeql-analysis.yml    # セキュリティ分析
│   └── auto-merge.yml         # 自動マージ
└── package.json               # ルートパッケージ設定
```

## 主な機能

### MCPサーバー機能

- **天気予報ツール**: 指定した都市の天気情報を取得
- **HTTP API**: Hono.jsベースのRESTful API
- **認証**: AWS Cognito OAuth 2.0認証
- **サーバーレス**: AWS Lambda上で動作

### インフラストラクチャ

- **AWS CDK**: Infrastructure as Code
- **AWS Lambda**: サーバーレス実行環境
- **AWS Cognito**: ユーザー認証・認可
- **AWS DynamoDB**: データストレージ
- **AWS API Gateway**: HTTPエンドポイント

### 開発・運用

- **TypeScript**: 型安全な開発
- **ESLint**: コード品質管理
- **Vitest**: テストフレームワーク
- **GitHub Actions**: CI/CD パイプライン

## 前提条件

- Node.js 22.x
- pnpm 10.14.0+
- AWS CLI設定済み
- AWS CDK CLI

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/poad/aws-mcp-lambda-server.git
cd aws-mcp-lambda-server
```

### 2. 依存関係のインストール

```bash
pnpm install
```

### 3. プロジェクトのビルド

```bash
pnpm run build
```

## デプロイ

### AWS環境へのデプロイ

```bash
cd platform
npx cdk deploy --all
```

### 設定オプション

CDKコンテキストで以下の設定が可能です：

```bash
# プロジェクト名の設定
npx cdk deploy -c project-name=my-mcp-server

# 認証の有効化
npx cdk deploy -c use-auth=true

# ドメインの設定
npx cdk deploy -c domain=my-domain
```

## 開発

### ローカル開発サーバーの起動

```bash
cd platform
pnpm run dev
```

### テストの実行

```bash
pnpm run test
```

### リンティング

```bash
pnpm run lint
pnpm run lint-fix  # 自動修正
```

## MCPツールの追加

新しいMCPツールを追加するには：

1. `platform/lambda/mcp-server/tools/` に新しいツールファイルを作成
2. `platform/lambda/mcp-server/mcp-server.ts` でツールを登録

例：

```typescript
// tools/MyTool.ts
interface MyToolInput {
  message: string;
}

async function handler(args: MyToolInput): Promise<{
  content: { type: 'text', text: string }[]
}> {
  return {
    content: [
      {
        type: 'text',
        text: `処理結果: ${args.message}`,
      },
    ],
  };
}

export default handler;
```

```typescript
// mcp-server.ts
import myTool from './tools/MyTool.js';

server.tool(
  'my_tool',
  'カスタムツールの説明',
  { message: z.string().describe('メッセージ') },
  myTool,
);
```

## Claude Desktopとの連携

### 設定ファイルの場所

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

### 設定例

```json
{
  "mcpServers": {
    "aws-mcp-lambda-server": {
      "command": "node",
      "args": ["/path/to/aws-mcp-lambda-server/platform/lambda/mcp-server/dist/index.js"]
    }
  }
}
```

## サンプルクライアント

`example/client/` にNext.jsベースのWebクライアントが含まれています。

### クライアントの起動

```bash
cd example/client
pnpm install
pnpm run dev
```

## 認証設定

AWS Cognitoを使用したOAuth 2.0認証をサポートしています。

### 認証フロー

1. クライアントがCognitoの認証エンドポイントにリダイレクト
2. ユーザーがログイン
3. 認証コードを取得してアクセストークンと交換
4. MCPサーバーAPIへのアクセス時にトークンを使用

## CI/CD

GitHub Actionsを使用した自動化：

- **CI**: プルリクエスト時の自動ビルド・テスト
- **CD**: mainブランチへのマージ時の自動デプロイ
- **セキュリティ**: CodeQL分析
- **依存関係**: Dependabot自動更新

## ライセンス

MIT License

## 作者

Kenji Saito

## コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 参考資料

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Hono.js Documentation](https://hono.dev/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
