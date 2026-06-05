# 🥨 CRM NINIT Group — Cómo arrancar en VS Code

## Requisito previo
Tener instalado **Node.js** (versión 18 o más).
Si no lo tenés: https://nodejs.org → descargá la versión "LTS" → instalá.
Para verificar, abrí una terminal y escribí:  node -v

---

## Pasos (en orden)

### 1. Abrir el proyecto
VS Code → File → Open Folder → elegí esta carpeta (ninit-crm).

### 2. Abrir la terminal
Menú: Terminal → New Terminal.

### 3. Instalar dependencias (una sola vez)
En la terminal escribí:

    npm install

Espera a que termine (~1 min).

### 4. Cargar tus claves
Abrí el archivo  .env  (ya está en la carpeta) y reemplazá:
- VITE_SUPABASE_URL        → la URL de tu proyecto Supabase
- VITE_SUPABASE_ANON_KEY   → tu "anon public key" de Supabase
- VITE_N8N_SEND_WEBHOOK    → la URL del webhook de n8n

(Las dos de Supabase están en: Supabase → Settings → API)

### 5. Probar en tu compu
En la terminal:

    npm run dev

Te va a mostrar una dirección como  http://localhost:5173
Abrila en el navegador y ya ves el CRM funcionando.

Para frenarlo: en la terminal apretá  Ctrl + C

---

## ⚠️ Importante: antes de que muestre datos
La app lee de Supabase. Si todavía no creaste las tablas:
1. Andá a Supabase → SQL Editor → New query
2. Pegá TODO el contenido de  supabase_schema.sql
3. Apretá RUN
4. Andá a Authentication → Users → Add user → creá los 3 usuarios del equipo

Recién ahí vas a poder entrar con email y contraseña.

---

## Archivos de este proyecto (referencia)
- src/            → el código de la app (no hace falta tocarlo)
- .env            → tus claves (editá este)
- supabase_schema.sql      → se ejecuta en Supabase (paso de arriba)
- n8n_NINITCRM-Send.json  → se importa en n8n
- README.md       → documentación técnica completa
- EMPEZAR-AQUI.md → este archivo
