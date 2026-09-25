# PrismDesk

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md)

PrismDesk は、同じローカル画像またはオリジナルのオーロラアニメーションを Codex デスクトップ版と WorkBuddy に個別適用する Windows 11 向けオープンソース外観ツールです。アカウント、クラウド、有料機能、テーマストアはありません。

> OpenAI または Tencent との公式関係、承認、提携はない独立コミュニティプロジェクトです。

![PrismDesk](docs/screenshots/pet-and-settings.png)

## 状態と機能

現在のバージョンは Windows 11 x64 向け **`0.1.0-alpha.1`** です。Codex 26.917.9434.0 と WorkBuddy 5.5.3.0 で画像、オーロラ、再適用、復元を実機確認し、WorkBuddy では一時停止も確認しています。

- インストール、バージョン、プロセス、接続、互換状態を検出。
- PNG/JPEG/WebP と、リモート素材を使わない Canvas オーロラ。
- 明るさ、不透明度、ぼかし、速度、15/30/60 FPS を調整。
- クライアント別の適用、一時停止、復元。重複しない注入と限定的なクリーンアップ。
- スクリプトを実行しない宣言型テーマ検証とローカル保存。
- クリック、ドラッグ、透明部分の入力透過、位置保存に対応する Prism デスクトップペット。
- 設定を閉じた後もシステムトレイに常駐。

## 安全な仕組み

インストールファイル、`app.asar`、署名は変更しません。Codex は `127.0.0.1:9222` の `app://-/index.html`、WorkBuddy は `127.0.0.1:9223` の `renderer/index.html` を検証してから接続します。チャット本文や認証情報は読み取らず、ログにも記録しません。

## 開発とビルド

Windows 11 x64 と Node.js 22+ が必要です。Electron 38、TypeScript 5、ネイティブ HTML/CSS/DOM、esbuild、electron-builder を使用し、React と Vite は使用していません。

```powershell
git clone https://github.com/XY-code1/PrismDesk.git
cd PrismDesk
npm install
npm run check
npm test
npm run dev
npm run package:win
```

Windows 生成物は `release/` の NSIS インストーラーとポータブル EXE です。`release/` は Git 管理対象外です。

## 制限

注入はセッション単位で、クライアント更新後は再検証が必要です。入力、コードコピー、長いスクロール、全ダイアログ、クリーン環境での更新・削除は手動確認項目です。テストビルドは商用コード署名されていません。

[アーキテクチャ](docs/ARCHITECTURE.md) · [互換性](docs/COMPATIBILITY.md) · [テスト](docs/TEST_RECORD.md) · [貢献](CONTRIBUTING.md) · [第三者ライセンス](THIRD_PARTY_NOTICES.md)

オリジナルコードは [MIT License](LICENSE) です。
