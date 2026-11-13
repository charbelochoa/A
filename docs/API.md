# API bancaria

Origen publicado: `https://aluranee-api.136-118-8-128.sslip.io`.

| Método | Ruta | Función |
| --- | --- | --- |
| POST | `/api/auth/register` | Crear una identidad ficticia y abrir sesión |
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Revocar la sesión |
| GET | `/api/me` | Consultar perfil y token CSRF de la sesión |
| GET | `/api/overview` | Consultar saldos, tarjetas y movimientos recientes |
| GET | `/api/transactions` | Filtrar y paginar movimientos |
| GET | `/api/beneficiaries` | Consultar beneficiarios y directorio ficticio |
| POST | `/api/beneficiaries` | Guardar un beneficiario |
| DELETE | `/api/beneficiaries/{id}` | Eliminar un beneficiario propio |
| POST | `/api/transfers` | Registrar una transferencia simulada |
| GET | `/api/transfers/{id}/receipt` | Descargar un comprobante propio |
| PATCH | `/api/cards/{id}` | Cambiar el estado de una tarjeta propia |
| GET | `/api/support/tickets` | Consultar solicitudes de atención |
| POST | `/api/support/tickets` | Registrar una solicitud |
| GET | `/api/documents/{id}` | Consultar un documento propio |
| POST | `/api/support/export` | Descargar un expediente disponible |
| GET | `/api/health` | Informar disponibilidad de la persistencia |

Desde Pages, las solicitudes autenticadas envían `X-Session-Token`. Las modificaciones envían además `X-CSRF-Token`. Las transferencias requieren `Idempotency-Key`, que se conserva al reintentar la misma operación. Los importes de la API son enteros en centavos de MXN.

Los módulos académicos de archivo y conciliación conservan sus rutas en el código. No forman parte del flujo bancario habitual. Las rutas de administración del evento no están publicadas mediante Caddy.
