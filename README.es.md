# PrismDesk

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md)

PrismDesk es una herramienta de apariencia de código abierto para Windows 11. Aplica por separado la misma imagen local o una animación de aurora original a Codex para escritorio y WorkBuddy. Funciona localmente, sin cuenta, nube, funciones de pago ni tienda de temas.

> Es un proyecto comunitario independiente, no afiliado, autorizado ni respaldado por OpenAI o Tencent.

![PrismDesk](docs/screenshots/pet-and-settings.png)

## Estado y funciones

La versión actual es **`0.1.0-alpha.1`** para Windows 11 x64. Se verificaron imagen, aurora, reaplicación y restauración en Codex 26.917.9434.0 y WorkBuddy 5.5.3.0; la pausa también se verificó en WorkBuddy.

- Detecta instalación, versión, proceso, conexión y compatibilidad.
- Importa PNG/JPEG/WebP e incluye una aurora Canvas sin recursos remotos.
- Controla brillo, opacidad, desenfoque, velocidad y 15/30/60 FPS.
- Aplicación por cliente, pausa, restauración e inyección sin duplicados.
- Temas declarativos validados, sin ejecución de scripts, y almacenamiento local.
- Mascota transparente Prism con clic, arrastre, paso del ratón y posición persistente.
- Permanencia en la bandeja del sistema al cerrar los ajustes.

## Seguridad

No modifica archivos instalados, `app.asar` ni firmas. Valida `app://-/index.html` para Codex en `127.0.0.1:9222` y `renderer/index.html` para WorkBuddy en `127.0.0.1:9223`. No lee conversaciones ni credenciales y no registra contenido de páginas.

## Desarrollo y empaquetado

Requiere Windows 11 x64 y Node.js 22+. Usa Electron 38, TypeScript 5, HTML/CSS/DOM nativos, esbuild y electron-builder; no usa React ni Vite.

```powershell
git clone https://github.com/XY-code1/PrismDesk.git
cd PrismDesk
npm install
npm run check
npm test
npm run dev
npm run package:win
```

Los resultados son un instalador NSIS y un EXE portátil en `release/`, carpeta excluida de Git.

## Limitaciones

La inyección dura una sesión y las actualizaciones del cliente requieren nueva verificación. Entrada de texto, copia de código, desplazamiento largo, todos los diálogos y actualización o desinstalación en un sistema limpio siguen siendo pruebas manuales. Las compilaciones de prueba no tienen firma comercial.

[Arquitectura](docs/ARCHITECTURE.md) · [Compatibilidad](docs/COMPATIBILITY.md) · [Pruebas](docs/TEST_RECORD.md) · [Contribuir](CONTRIBUTING.md) · [Licencias de terceros](THIRD_PARTY_NOTICES.md)

El código original usa [MIT License](LICENSE).
