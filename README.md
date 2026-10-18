# SaitamaAPI PRO — Control Center

Panel responsive en español para iniciar sesión con Google, generar una API key por usuario, probar endpoints desde el navegador y revisar el uso diario.

## Incluye

- Inicio de sesión con Google OAuth 2.0 y sesión protegida con cookie HttpOnly.
- Generación automática de una `sai_...` API key al iniciar sesión por primera vez.
- API key activa validada en `x-api-key` para llamadas externas.
- Probador web de `/api/ping`, `/api/info`, `/api/ytsearch`, `/api/play/audio`, `/api/play/video`, `/api/facebook`, `/api/tiktok`, `/api/instagram` y `/api/spotify`.
- El probador usa la sesión del usuario y comprueba que tenga una clave activa; no coloca la clave secreta en la URL ni necesita mostrarla al JavaScript.
- Registro de uso y errores, límite diario configurable y admins ilimitados mediante `ADMIN_EMAILS`.
- Diseño adaptable a móvil, menú lateral, documentación y vista administrativa.

## Requisitos

- Node.js 20 o superior.
- Credenciales OAuth de Google.
- Un proveedor upstream válido para cada API que quieras activar.

## Instalación local

```bash
cp .env.example .env
npm install
npm start
```

Abre `http://localhost:3000`.

Genera un secreto de sesión con un generador criptográfico confiable y configúralo en `SESSION_SECRET`. En producción, configura `NODE_ENV=production`, `APP_ORIGIN` y `GOOGLE_CALLBACK_URL` con el dominio HTTPS real.

## Google OAuth

En Google Cloud Console, crea un OAuth Client ID de tipo **Web application** y registra estos valores exactamente:

- Authorized JavaScript origin: el dominio base de tu web, por ejemplo `https://api.example.com`.
- Authorized redirect URI: `https://api.example.com/auth/google/callback`.

Pon el Client ID, Client Secret y callback URL en las variables de entorno del servidor. Nunca publiques el Client Secret en GitHub ni en el navegador.

## Configurar endpoints

Cada variable `*_UPSTREAM` debe contener una URL base real del proveedor que devuelva JSON y acepte el parámetro requerido. Ejemplos de parámetros:

- YouTube search, audio, video y Spotify: `q`
- Facebook, TikTok e Instagram: `url`

Los proveedores no vienen inventados ni incluidos: cuando una variable está vacía, el panel devuelve un error claro indicando cuál falta. El probador usa el endpoint configurado por el servidor y registra el resultado.

## API externa

Las llamadas desde otras aplicaciones deben incluir la API key en el encabezado HTTP:

```http
x-api-key: sai_TU_CLAVE
```

Ejemplo de prueba (sustituye dominio, clave y parámetros):

```bash
curl -H 'x-api-key: sai_TU_CLAVE' 'https://api.example.com/api/ytsearch?q=Shakira&limit=5'
```

No incluyas la API key en una URL ni en código frontend público.

## Almacenamiento y despliegue

Los datos de usuarios, hashes de claves y uso se guardan en `data/db.json`. Esta persistencia en archivo sirve para pruebas o un servidor Node con disco persistente; para producción multiinstancia/serverless usa una base de datos persistente y protegida.

**Importante sobre Cloudflare Workers:** este ZIP es una aplicación Node.js/Express. No se despliega directamente como Worker estático. Si tu sitio actual está en Cloudflare Workers, no reemplaces el repositorio de ese Worker con este proyecto sin adaptar el backend y su base de datos.

## Rutas

| Ruta | Uso |
|---|---|
| `GET /api/ping` | Estado básico, sin clave |
| `GET /api/info` | Información de API, requiere `x-api-key` |
| `GET /api/ytsearch?q=...` | Búsqueda YouTube |
| `GET /api/play/audio?q=...` | Proveedor de audio |
| `GET /api/play/video?q=...` | Proveedor de video |
| `GET /api/facebook?url=...` | Proveedor Facebook |
| `GET /api/tiktok?url=...` | Proveedor TikTok |
| `GET /api/instagram?url=...` | Proveedor Instagram |
| `GET /api/spotify?q=...` | Proveedor Spotify |

## GitHub y secretos

No subas `.env`, `data/db.json`, sesiones, API keys ni secretos OAuth. El `.gitignore` excluye esos archivos.


## MX PLUS polish update
- Añade menú de perfil e información de la cuenta Google, flechas para volver y botón de cierre de sesión.
- Al acceder por Google, el panel genera una API key si la cuenta aún no tiene una.
- El probador interno usa la sesión autenticada y la clave activa del usuario en el servidor; no necesita que pegues manualmente la clave.
- Las APIs externas requieren configurar sus URLs proveedoras en variables de entorno.
