# PrismDesk

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md)

PrismDesk は、同じローカル画像またはオリジナルのオーロラアニメーションを Codex デスクトップ版と WorkBuddy に個別適用し、クライアントウィンドウの中にオリジナルのペットを 1 体注入する Windows 11 向けオープンソース外観ツールです。アカウント、クラウド、有料機能、テーマストアはありません。

> OpenAI または Tencent との公式関係、承認、提携はない独立コミュニティプロジェクトです。

![PrismDesk](docs/screenshots/pet-and-settings.png)

## 状態と機能

現在のバージョンは Windows 11 x64 向け **`0.1.0-alpha.1`** です。Codex 26.917.9434.0 と WorkBuddy 5.5.3.0 で画像、オーロラ、再適用、復元を実機確認し、WorkBuddy では一時停止も確認しています。クライアント内フローティングペットは自動テスト（49/49）に合格していますが、実機での手動確認はこれからで、手順と結果は[テスト記録](docs/TEST_RECORD.md)のマトリクスにあります。

- インストール、バージョン、プロセス、接続、互換状態を検出。
- PNG/JPEG/WebP と、リモート素材を使わない Canvas オーロラ。
- 明るさ、不透明度、ぼかし、速度、15/30/60 FPS を調整。
- クライアント別の適用、一時停止、復元。重複しない注入と限定的なクリーンアップ。
- スクリプトを実行しない宣言型テーマ検証とローカル保存。
- **クライアント内フローティングペット（既定）**: Codex と WorkBuddy のメイン描画ページにペットを注入。クライアントウィンドウの中だけに存在し、ドラッグとリサイズに対応し、位置はクライアントごとに記憶します。透明部分はクリックを通し、単クリックでサイドパネルを開閉します。
- ペット画像は透過 PNG/WebP/GIF に対応し、サイズ、左右反転、表示/非表示、既定への復元を設定できます。素材は本機にのみ保存します。
- **Windows デスクトップペット（任意）**: 従来の独立した透明最前面ウィンドウ。設定で切り替えます。
- 既定への復元で、注入したペット、パネル、背景、スタイル、リスナーをまとめて削除。
- 設定を閉じた後もシステムトレイに常駐。

## 安全な仕組み

インストールファイル、`app.asar`、署名は変更しません。Codex は `127.0.0.1:9222` の `app://-/index.html`、WorkBuddy は `127.0.0.1:9223` の `renderer/index.html` を検証してから接続します。ペットとパネルはクライアントのレンダラープロセス内で固定 ID のホスト要素と Shadow DOM だけを使い、ページのノードにはリスナーを登録しません。透明部分の判定は PrismDesk 自身が行うため、ページ本来のスクロール、入力、ダイアログは影響を受けません。注入ページのリクエストキューは 900 ミリ秒ごとにメインプロセスが回収し、設定ファイルと同じ検証を通します。チャット本文や認証情報は読み取らず、ログにも記録しません。

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

## ペットの形態

クライアント内フローティングペットが既定です。設定の「宠物形态」で切り替えられ、どちらも同じテーマを共有します。Windows デスクトップペットは独立した透明最前面ウィンドウで、位置は `userData/pet.json` に保存されます。設定ウィンドウを閉じてもトレイに残り、トレイメニューの「退出 PrismDesk」で完全に終了します。

## 制限

注入はセッション単位で、クライアント更新後は再検証が必要です。入力、コードコピー、長いスクロール、全ダイアログ、クリーン環境での更新・削除は手動確認項目です。ペットのサイズ、左右反転、表示は 2 つのクライアントで共通で、位置のみクライアントごとに記憶します。Wallpaper Engine は第 2 段階で、公開された統合方法と検出可能なパスの調査だけを実施しています（[調査メモ](docs/RESEARCH-WALLPAPER-ENGINE.md)）。Steam ワークショップの素材取得や、他者の壁紙の同梱は行いません。テストビルドは商用コード署名されていません。

[アーキテクチャ](docs/ARCHITECTURE.md) · [互換性](docs/COMPATIBILITY.md) · [テスト](docs/TEST_RECORD.md) · [貢献](CONTRIBUTING.md) · [第三者ライセンス](THIRD_PARTY_NOTICES.md)

オリジナルコードは [MIT License](LICENSE) です。