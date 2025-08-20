# AWS MCP Lambda Server - プロジェクト概要

## プロジェクトの目的
AWS Lambda上で動作するModel Context Protocol (MCP) サーバーの実装。MCPサーバーをAWSのサーバーレス環境で実行し、Claude DesktopなどのMCPクライアントと連携できるようにする。

## 技術スタック
- **言語**: TypeScript
- **ランタイム**: Node.js 22.x
- **パッケージマネージャー**: pnpm
- **フレームワーク**: 
  - Hono.js (HTTP API)
  - AWS CDK (Infrastructure as Code)
- **主要ライブラリ**:
  - @modelcontextprotocol/sdk
  - aws-cdk-lib
  - hono
  - zod
  - jose (JWT処理)
  - @aws-lambda-powertools/logger

## プロジェクト構造
```
platform/
├── bin/                     # CDKアプリケーションエントリーポイント
├── lib/                     # CDKスタック定義
├── lambda/                  # Lambda関数のソースコード
│   ├── mcp-server/         # MCPサーバー実装
│   │   ├── tools/          # MCPツール（WeatherTool等）
│   │   ├── index.ts        # Lambda関数エントリーポイント
│   │   ├── mcp-server.ts   # MCPサーバー設定
│   │   └── server.ts       # 開発用サーバー
│   ├── authorize.ts        # OAuth認証処理
│   ├── token.ts           # トークン管理
│   ├── revoke.ts          # トークン無効化
│   ├── clients.ts         # クライアント管理
│   └── utils.ts           # ユーティリティ関数
└── package.json
```

## 主な機能
- MCPサーバー（天気予報ツール等）
- AWS Cognito OAuth 2.0認証
- サーバーレス実行環境（AWS Lambda）
- RESTful API（Hono.js）