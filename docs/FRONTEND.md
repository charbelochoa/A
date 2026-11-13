# Frontend de Aluranee

El diseño parte del HTML de referencia entregado: composición editorial, encabezados serif, texto Public Sans, azul institucional, acentos dorados, fotografía propia y separadores finos. Los archivos originales permanecen locales; `web/assets/` contiene las versiones optimizadas utilizadas por el sitio.

## Pantallas incluidas

| Área | Rutas bajo `/A/` | Contenido |
| --- | --- | --- |
| Portal | `/` | Presentación de marca, productos, patrimonio e institución |
| Información | `/personas/`, `/patrimonio/`, `/nosotros/` | Productos y alcance de la simulación |
| Asistencia | `/seguridad/`, `/ayuda/` | Acceso, operaciones y canales disponibles |
| Condiciones | `/privacidad/`, `/terminos/` | Datos registrados y condiciones del entorno académico |
| Acceso | `/acceso/`, `/registro/` | Inicio de sesión y apertura de identidad ficticia |
| Banca | `/banca/` | Resumen, saldos, tarjetas y movimientos recientes |
| Cuentas | `/banca/cuentas/` | Saldos y datos de cuentas propias |
| Movimientos | `/banca/movimientos/` | Filtros por cuenta y concepto, resultados y paginación |
| Transferencias | `/banca/transferir/` | Datos, confirmación, resultado y descarga de comprobante |
| Beneficiarios | `/banca/beneficiarios/` | Directorio, alta y eliminación con confirmación |
| Tarjetas | `/banca/tarjetas/` | Tarjeta ficticia y cambio de estado |
| Atención | `/banca/atencion/` | Solicitudes y descarga de expedientes |
| Perfil | `/banca/perfil/` | Nombre, identificador y duración de sesión |
| Móvil | `/app/` y las mismas secciones bancarias | Navegación inferior y presentación adaptada al teléfono |
| Más | `/app/mas/` | Movimientos, beneficiarios, atención y perfil |
| Teléfono | `/movil/` | Presentación de la aplicación dentro de un dispositivo |
| No disponible | Cualquier ruta no reconocida | Página 404 con acceso al portal y ayuda |

## Estados de interfaz

El código incluye estados de carga, errores de acceso, conexión o caducidad de sesión, resultados vacíos, validación de formularios, solicitudes en curso, confirmación de eliminación y comprobante de transferencia. El formulario de transferencia conserva los datos al volver desde su confirmación. Los diálogos tienen nombre accesible y el menú de banca permanece disponible cuando la navegación lateral se oculta en pantallas estrechas.

Los enlaces de acceso móvil y escritorio se construyen con la misma ruta base del sitio. Los enlaces, fuentes e imágenes estáticos reciben el prefijo `/A/` durante la preparación de Pages. Los comprobantes se descargan mediante la API autenticada.

La navegación de teléfono usa una isla flotante inspirada en `src/DynamicIsland.tsx` y `src/interface.css` del proyecto AERIS del usuario: superficie oscura, borde fino, esquinas redondeadas y sombra separada del contenido. Mantiene los cinco accesos de la banca, indica la sección activa y respeta el área segura inferior. Incluye variantes de contraste y transparencia reducida y controles accesibles mediante teclado.

## Variantes

`main` presenta el portal institucional. La variante `mobile` conserva el mismo código y cambia `channel.json` a `{"default":"mobile"}`. Al preparar esa variante, la entrada principal lleva a la interfaz `/app/`; la API y sus reglas se comparten entre ambos canales. La publicación automática de este repositorio permanece vinculada a `main`.

## Revisión de esta entrega

Por indicación del usuario, la revisión final es de código: rutas, plantillas, estilos, formularios y correspondencia con los endpoints de `docs/API.md`. No se ejecutan suites, transacciones, pruebas funcionales ni de ataque. Esta revisión no acredita resultados de ejecución o renderizado de todas las pantallas autenticadas.
