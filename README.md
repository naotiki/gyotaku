# gyotaku

ウェブサイトをクロールしてアーカイブするCLIツール

## 概要

gyotakuは、指定したウェブサイトをクロールし、HTMLページをローカルにアーカイブするTypeScript製のCLIアプリケーションです。

## インストール

```bash
pnpm install
pnpm run build
```

## 使い方

### 基本的な使用方法

```bash
pnpm start <URL>
```

または、ビルド後に直接実行:

```bash
node dist/index.js <URL>
```

### オプション

- `-o, --output <dir>`: 出力ディレクトリを指定（デフォルト: `./archive`）
- `-d, --depth <number>`: クロールの深さを指定（デフォルト: `1`）
- `-w, --wait <ms>`: リクエスト間の待機時間をミリ秒で指定（デフォルト: `1000`）

### 使用例

```bash
# 基本的なクロール
pnpm start https://example.com

# 出力先を指定
pnpm start https://example.com -o ./my-archive

# 深さ2まで、待機時間2秒でクロール
pnpm start https://example.com -d 2 -w 2000
```

## 機能

- 指定したURLからWebページをクロール
- HTMLコンテンツをローカルに保存
- 画像、CSS、JavaScriptなどすべてのリソースをダウンロード（外部オリジン含む）
- URLと同じディレクトリ構造でファイルを保存
- ダウンロードしたファイルだけでWebサイトを再現可能（オフライン閲覧対応）
- 同一ドメイン内のリンクを辿って再帰的にクロール
- クロール深さの制御
- リクエスト間隔の調整機能
- クロールメタデータの記録

## 開発

```bash
# TypeScriptのビルド
pnpm run build

# 開発モード（ビルド後実行）
pnpm run dev
```

## ライセンス

ISC
