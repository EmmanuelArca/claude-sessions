# Claude Sessions

> Visor de sesiones de **Claude Code** para Windows, macOS y Linux.

Navega, buscá y recuperá todas tus conversaciones anteriores de Claude Code desde una interfaz gráfica limpia, sin abrir ningún archivo manualmente.

---

## ¿Qué hace?

- Lista todas las sesiones almacenadas en `~/.claude/projects/`
- Muestra el **directorio**, el **primer mensaje** y la **fecha** de cada sesión
- Permite **recuperar una sesión** directamente (`claude -r <id>`) abriendo una nueva terminal en el directorio correcto
- Permite **abrir solo el directorio** en una terminal sin reanudar
- **Buscar** por directorio, mensaje o ID de sesión
- Funciona en **Windows**, **macOS** y **Linux**

---

## Descarga

| Plataforma | Link |
|---|---|
| Windows (x64) | [Releases → claude-sessions-win32](../../releases) |

> Los binarios pre-compilados están disponibles en la sección [**Releases**](../../releases) de este repositorio.

---

## Ejecutar desde código fuente

### Requisitos

- [Node.js](https://nodejs.org/) 18 o superior
- [Claude Code](https://claude.ai/code) instalado (para la función de recuperar sesiones)

### Pasos

```bash
# 1. Clonar el repo
git clone https://github.com/tu-usuario/claude-sessions.git
cd claude-sessions

# 2. Instalar dependencias
npm install

# 3. Lanzar la app
npm start
```

---

## Estructura del proyecto

```
claude-sessions/
├── main.js        # Proceso principal de Electron — lee los .jsonl y lanza terminales
├── preload.js     # Bridge seguro entre main y renderer (contextBridge)
├── index.html     # UI completa (HTML + CSS + JS vanilla)
└── package.json
```

No hay framework de UI ni bundler. Todo el frontend es HTML/CSS/JS plano cargado directamente por Electron.

---

## Cómo funciona

Claude Code guarda cada conversación como un archivo `.jsonl` en:

```
~/.claude/projects/<hash-del-directorio>/<session-id>.jsonl
```

Cada línea es un mensaje JSON con campos `type`, `cwd`, `sessionId`, `timestamp` y `message`. La app lee esos archivos directamente desde el sistema de archivos, sin ninguna API ni servidor.

Al presionar **Recuperar sesión**, se abre una nueva ventana de terminal en el directorio del proyecto y se ejecuta `claude -r <session-id>` para reanudar la conversación.

---

## Build

Para compilar el ejecutable para Windows:

```bash
npm install --save-dev electron-builder

npx electron-builder --win --x64
```

El output queda en `dist/`.

---

## Licencia

MIT
