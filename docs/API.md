# API bancaria

Origen publicado: `https://aluranee-api.136-118-8-128.sslip.io`.

| Método | Ruta | Función |
| --- | --- | --- |
| POST | `/api/auth/register` | Crear una identidad ficticia y abrir sesión |
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Revocar la sesión |
| GET | `/api/me` | Consultar perfil y token CSRF de la sesión |
| GET | `/api/overview` | Consultar saldos, tarjetas y movimientos recientes |
| GET | `/api/accounts/{id}/summary` | Consultar ingresos y gastos mensuales de una cuenta propia |
| POST | `/api/deposits` | Acreditar un depósito simulado a una cuenta propia |
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

Los depósitos también requieren `Idempotency-Key`. Reciben `account_id` e `amount`, admiten entre $0.01 y $10,000,000.00 ficticios por depósito y no pueden superar un saldo de $999,999,999.99. Se limitan a las cuentas de cliente del usuario autenticado; no permiten acreditar concentradoras ni cuentas de otro equipo. El saldo, el movimiento y la referencia se guardan en una transacción atómica. Repetir la misma solicitud con la misma clave devuelve su resultado original.

El resumen de ingresos y gastos presenta seis meses por cuenta, con periodos definidos en la zona `America/Mexico_City`. No se calcula a partir de los ocho movimientos del inicio: consulta los movimientos registrados de cada periodo.

Los módulos académicos de archivo y conciliación conservan sus rutas en el código. No forman parte del flujo bancario habitual. Las rutas de administración del evento no están publicadas mediante Caddy.
