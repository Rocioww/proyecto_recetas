# Legado Culinario

Aplicación web de recetas familiares con árbol genealógico. Los usuarios crean "familias", construyen su árbol de miembros y añaden recetas que se comparten dentro de esa familia (autor, ingredientes, pasos, fotos, categoría y temporada). También hay favoritos y colecciones de recetas al estilo Pinterest.

## Stack

- **Backend:** Node.js + Express 5, MongoDB (driver nativo, sin ORM), autenticación con JWT + bcrypt, login con Google, subida de fotos con Cloudinary.
- **Frontend:** React 19 + Vite + React Router 7 + Tailwind CSS 4.

## Estructura

```
backend/    API Express (index.js: rutas, datos.js: acceso a MongoDB, parentesco.js: cálculo del árbol genealógico)
frontend/   SPA React (src/pages: vistas, src/api.js: cliente HTTP, src/context: estado de sesión)
```

## Puesta en marcha

Requiere Node.js y una base de datos MongoDB (local o Atlas).

### Backend

```
cd backend
npm install
```

Copia `.env.example` a `.env` y rellena los valores:

- `MONGO_URL` — cadena de conexión a MongoDB
- `SECRET` — clave para firmar los JWT (cualquier cadena aleatoria larga)
- `PORT` — puerto del servidor (por defecto 4000)
- `GOOGLE_CLIENT_ID` — client ID de Google OAuth (solo necesario para el login con Google)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — credenciales de Cloudinary (solo necesarias para subir fotos)

```
npm run dev
```

### Frontend

```
cd frontend
npm install
```

Copia `.env.example` a `.env` y rellena:

- `VITE_API_URL` — URL del backend (por defecto `http://localhost:4000`)
- `VITE_GOOGLE_CLIENT_ID` — mismo client ID de Google que en el backend, si se usa login con Google

```
npm run dev
```

## Modelo de datos (MongoDB, sin migraciones formales)

- `usuarios` — cuenta, email, hash de contraseña (o cuenta vinculada a Google), favoritos
- `familias` — nombre, dueño (`creadaPor`), lista de acceso (`acceso: [{usuario, rol}]`, rol `"familia"` o `"espectador"`)
- `miembros` — nodos del árbol genealógico de cada familia, con parentesco calculado
- `recetas` — ingredientes, pasos, categoría, temporada, fotos; vinculadas a una familia y a un miembro autor
- `colecciones` — agrupaciones de recetas por usuario, con opción de "guardar" colecciones de otros
- `sugerencias` — propuestas de cambio a un miembro/familia/receta cuando quien edita no es el dueño

## Estado del proyecto

No hay tests automatizados; la verificación es manual (ver `backend/pruebas.rest` para peticiones de ejemplo). Limitaciones conocidas: no hay recuperación de contraseña ni verificación de email tras el registro.
