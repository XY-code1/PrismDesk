# PrismDesk

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md)

PrismDesk es una herramienta de apariencia de código abierto para Windows 11. Aplica por separado la misma imagen local o una animación de aurora original a Codex para escritorio y WorkBuddy, e inyecta una mascota original dentro de la ventana del cliente. Funciona localmente, sin cuenta, nube, funciones de pago ni tienda de temas.

> Es un proyecto comunitario independiente, no afiliado, autorizado ni respaldado por OpenAI o Tencent.

![PrismDesk](docs/screenshots/pet-and-settings.png)

## Estado y funciones

La versión actual es **`0.1.0-alpha.1`** para Windows 11 x64. Se verificaron imagen, aurora, reaplicación y restauración en Codex 26.917.9434.0 y WorkBuddy 5.5.3.0; la pausa también se verificó en WorkBuddy. La mascota flotante dentro del cliente supera las pruebas automáticas (49/49), pero su verificación manual en clientes reales sigue pendiente y figura en la [matriz de pruebas](docs/TEST_RECORD.md).

- Detecta instalación, versión, proceso, conexión y compatibilidad.
- Importa PNG/JPEG/WebP e incluye una aurora Canvas sin recursos remotos.
- Controla brillo, opacidad, desenfoque, velocidad y 15/30/60 FPS.
- Aplicación por cliente, pausa, restauración e inyección sin duplicados.
- Temas declarativos validados, sin ejecución de scripts, y almacenamiento local.
- **Mascota flotante dentro del cliente (predeterminada)**: inyecta una mascota original en la página principal de Codex y WorkBuddy. Solo existe dentro de la ventana del cliente, se puede arrastrar y escalar, y recuerda una posición por cliente. Los píxeles transparentes dejan pasar el clic y un clic abre o cierra el panel lateral.
- La imagen de la mascota acepta PNG/WebP/GIF transparentes, con tamaño, espejo horizontal, mostrar/ocultar y restauración; el material se guarda solo en este equipo.
- **Mascota de escritorio de Windows (opcional)**: la ventana transparente siempre visible original, seleccionable en los ajustes.
- Restaurar los valores predeterminados elimina de una vez la mascota, el panel, el fondo, los estilos y los escuchadores inyectados.
- Permanencia en la bandeja del sistema al cerrar los ajustes.

## Seguridad

No modifica archivos instalados, `app.asar` ni firmas. Valida `app://-/index.html` para Codex en `127.0.0.1:9222` y `renderer/index.html` para WorkBuddy en `127.0.0.1:9223`. La mascota y el panel viven en el proceso de renderizado del cliente con dos elementos anfitriones de ID fijo y Shadow DOM, y nunca registran escuchadores en nodos de la página; como PrismDesk evalúa por sí mismo las zonas transparentes, el desplazamiento, la escritura y los diálogos de la página no se ven afectados. La cola de peticiones de la página inyectada se recoge cada 900 ms y pasa la misma validación estricta que el archivo de configuración. No lee conversaciones ni credenciales y no registra contenido de páginas.

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

## Formas de la mascota

La mascota flotante dentro del cliente es la forma predeterminada y se cambia en 宠物形态 de los ajustes; ambas formas comparten el mismo tema. La mascota de escritorio de Windows es una ventana transparente siempre visible cuya posición se guarda en `userData/pet.json`. Al cerrar los ajustes la aplicación permanece en la bandeja, y 退出 PrismDesk la cierra por completo.

## Limitaciones

La inyección dura una sesión y las actualizaciones del cliente requieren nueva verificación. Entrada de texto, copia de código, desplazamiento largo, todos los diálogos y actualización o desinstalación en un sistema limpio siguen siendo pruebas manuales. El tamaño, el espejo y la visibilidad de la mascota son comunes a ambos clientes; solo la posición se recuerda por cliente. Wallpaper Engine es la segunda fase: solo existe el estudio de su integración pública y de las rutas detectables ([nota de investigación](docs/RESEARCH-WALLPAPER-ENGINE.md)); no se extraen recursos del Workshop de Steam ni se incluyen fondos de terceros en el repositorio. Las compilaciones de prueba no tienen firma comercial.

[Arquitectura](docs/ARCHITECTURE.md) · [Compatibilidad](docs/COMPATIBILITY.md) · [Pruebas](docs/TEST_RECORD.md) · [Contribuir](CONTRIBUTING.md) · [Licencias de terceros](THIRD_PARTY_NOTICES.md)

El código original usa [MIT License](LICENSE).