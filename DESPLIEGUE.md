# Desplegar GochitoSystem en un VPS con Docker

Todo el sistema (base de datos + backend + frontend) corre en **tu VPS** con un
solo comando. La app queda en un único dominio, sin problemas de CORS y sin
servicios que "se duerman".

```
Internet
   │  (puerto 80/443)
   ▼
nginx (servicio "web")
   ├── /        → app React (archivos estáticos)
   └── /api/…   → backend Node/Express (puerto interno 4000)
                     │
                     ▼
                 MariaDB (red interna, con volumen persistente)
```

Solo el frontend (nginx) se expone al exterior; el backend y la base quedan en una
red privada de Docker.

---

## Requisitos

- Un VPS con **Ubuntu/Debian** y acceso por SSH.
- **Docker** y **Docker Compose** instalados (más abajo cómo).
- (Opcional pero recomendado) un dominio apuntando al VPS, para HTTPS.

Los secretos de producción (contraseñas, JWT, credenciales del admin) están en el
archivo **`secretos-produccion.txt`** de este proyecto (no se sube a GitHub).

---

## Paso 1 · Instalar Docker en el VPS (si no lo tiene)

Conéctate por SSH y ejecuta:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# cierra sesión y vuelve a entrar por SSH para que tome el grupo
```

Verifica: `docker --version` y `docker compose version`.

---

## Paso 2 · Traer el código al VPS

```bash
git clone https://github.com/RoyerMerchan/gochitosystem.git
cd gochitosystem
```

(Si el repo es privado, Git te pedirá usuario y token de RoyerMerchan.)

---

## Paso 3 · Configurar las variables de producción

```bash
cp .env.produccion.example .env.produccion
nano .env.produccion
```

Rellena con los valores de `secretos-produccion.txt`:

| Variable | Qué poner |
|---|---|
| `DB_NAME` | `gochitosystem` (déjalo así) |
| `DB_USER` | `gochito` (déjalo así) |
| `DB_PASSWORD` | la clave de `gochito` de `secretos-produccion.txt` |
| `DB_ROOT_PASSWORD` | la clave root de `secretos-produccion.txt` |
| `JWT_SECRET` | el JWT_SECRET de `secretos-produccion.txt` |
| `JWT_REFRESH_SECRET` | el JWT_REFRESH_SECRET de `secretos-produccion.txt` |
| `WEB_PORT` | `80` (o el puerto que quieras publicar) |
| `APP_URL` | `https://tu-dominio.com` (o `http://IP-del-VPS` si aún no tienes dominio) |

Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

---

## Paso 4 · Levantar todo

```bash
docker compose -f docker-compose.prod.yml --env-file .env.produccion up -d --build
```

La primera vez tarda unos minutos (compila el backend y el frontend). La base de
datos **se crea sola** y carga el esquema (`schema.sql`) y los datos iniciales
(`seed.sql`) automáticamente.

Verifica que los 3 servicios estén arriba:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend   # Ctrl+C para salir
```

Deberías ver en el log del backend: `GochitoSystem API en linea`.

---

## Paso 5 · Entrar

Abre en el navegador **`http://IP-del-VPS`** (o tu dominio).

- Usuario: `admin`  ·  Clave: `Admin123!`
- **Cambia la clave** de inmediato desde "Mi cuenta".
- Registra la **tasa del día** y ya puedes vender.

---

## Paso 6 · HTTPS (muy recomendado)

La forma más fácil, sin tocar el servidor: pon **Cloudflare** delante (gratis).

1. Registra tu dominio en Cloudflare (o cambia sus DNS a Cloudflare).
2. Crea un registro **A** apuntando a la IP del VPS.
3. En Cloudflare, SSL/TLS → modo **Flexible** (o Full si configuras cert en el VPS).
4. Listo: entras por `https://tu-dominio.com` y Cloudflare pone el candado.

Alternativa en el propio VPS: usar **Caddy** o **nginx + certbot** como proxy
delante del contenedor `web`. Si quieres, te preparo esa variante.

---

## Operación del día a día

**Ver estado / logs:**
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

**Actualizar a una versión nueva (tras hacer cambios y push a GitHub):**
```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.produccion up -d --build
```

**Apagar / encender:**
```bash
docker compose -f docker-compose.prod.yml down     # apaga (conserva los datos)
docker compose -f docker-compose.prod.yml up -d     # enciende
```

**Respaldo de la base de datos:**
```bash
docker exec gochito_mariadb sh -c 'mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" gochitosystem' > respaldo_$(date +%F).sql
```
Guárdalo fuera del VPS (descárgalo con `scp`). Para automatizarlo, un `cron`
diario con ese comando + subida a otro lado.

**Restaurar un respaldo:**
```bash
cat respaldo_2026-07-20.sql | docker exec -i gochito_mariadb sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" gochitosystem'
```

---

## Notas

- El volumen `gochito_db_data` guarda la base: sobrevive a `down`, reinicios y
  actualizaciones. Solo se borra con `docker compose ... down -v` (¡cuidado!).
- El `schema.sql` y `seed.sql` **solo** se cargan la primera vez (cuando el volumen
  está vacío). En actualizaciones posteriores no se vuelven a ejecutar, así que tus
  datos no se pierden.
- Si cambias el esquema en el futuro, se hace con migraciones, no borrando el volumen.
