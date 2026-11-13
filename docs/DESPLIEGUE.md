# Aluranee Bank

Aplicación bancaria de simulación con datos ficticios. No procesa dinero ni se conecta a bancos reales.

## Frontend

El portal, la banca y la presentación móvil se publican en `https://charbelochoa.github.io/A/`. El flujo de GitHub Actions prepara exclusivamente los archivos estáticos de `web/`, conserva las rutas bajo `/A/` y genera entradas para abrir directamente cada sección. Los recursos originales de diseño permanecen fuera de la publicación; se incluyen sus versiones optimizadas de `web/assets/`.

`scripts/build_pages.py` genera el sitio en `.local/pages/`. `web/config.js` proporciona la configuración local; el empaquetado genera la configuración del sitio publicado. La URL de API es pública y no contiene secretos.

## API

La API usa el origen `https://aluranee-api.136-118-8-128.sslip.io`. Caddy termina HTTPS y reenvía las rutas de la aplicación a un proceso que escucha exclusivamente en `127.0.0.1:8105`.

El servicio `aluranee` se ejecuta con un usuario sin acceso interactivo, restricciones de systemd, límite de memoria y un directorio de datos propio. Las versiones están en `/opt/aluranee/releases/`, el enlace `/opt/aluranee/current` selecciona la versión activa y los datos persisten en `/var/lib/aluranee`. Las credenciales y parámetros privados viven en `/etc/aluranee/runtime.env`, fuera del repositorio.

El instalador conserva una copia de la configuración de Caddy y añade un archivo de sitio separado. Valida la configuración antes de recargarla. Las demás rutas de la VM se conservan. La instalación de Aluranee no concede acceso a una terminal del anfitrión.

## Sesiones

GitHub Pages y la API son orígenes diferentes. El frontend conserva un token temporal en `sessionStorage` por pestaña y lo envía mediante `X-Session-Token`. El servidor conserva su hash, limita su duración a ocho horas y lo revoca al cerrar sesión. Las operaciones que modifican datos requieren además el token CSRF de la sesión.

CORS permite exclusivamente el origen de Pages configurado. No se usan cookies de terceros para iniciar sesión desde Pages. Las cookies de la aplicación servida bajo el mismo origen siguen siendo HttpOnly, Secure y SameSite=Strict. No deben cargarse scripts de terceros en el frontend ni introducirse credenciales reales en esta simulación.

## Operación y límites

La presentación móvil está disponible bajo `/A/app/` y la vista de teléfono bajo `/A/movil/`. Ambas consumen la misma API y comparten los datos de la sesión.

El despliegue inicial mantiene los módulos académicos existentes dentro de la aplicación, separados de la administración de la VM. Los endpoints administrativos no se publican mediante el proxy. El entorno final de custodia con terminal Linux por equipo no está implementado en esta entrega.

El objetivo de seis horas y la capacidad de equipos concurrentes permanecen sin calibrar. El despliegue puede requerir operaciones de instalación, publicación y revisión del estado de los servicios; no requiere ejecutar pruebas de ataque ni las suites de pruebas del proyecto.

## Datos y accesos de la actividad

`scripts/seed_bank.py` prepara el número solicitado de cuentas bancarias sintéticas, conservando los datos existentes y trabajando en lotes. Los clientes sintéticos se excluyen del inicio de sesión y los nuevos registros sintéticos tienen contraseñas inutilizables. Los usuarios participantes se crean por separado y conservan contraseñas individuales con hash scrypt.

La preparación del volumen de datos no inicia la ventana de competición. El estado de generación se conserva en `/var/lib/aluranee/seed-progress.json`. Las credenciales iniciales de participantes permanecen en un archivo privado del directorio de datos, fuera del repositorio y del directorio web.

La clave de organizador permite identificar al host en las herramientas de la aplicación; no corresponde a un usuario con un panel web de administrador. La consulta operativa se realiza mediante SSH y `scripts/manage.py`. El proxy mantiene bloqueada la ruta pública `/api/host/*`.

`scripts/package_release.py` incluye frontend, backend y utilidades operativas en el paquete de instalación. Las bases de datos, registros, configuraciones privadas y credenciales locales no forman parte de ese paquete.
