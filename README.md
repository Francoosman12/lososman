# Los Osman · Catálogo y sistema de gestión

El catálogo público de productos y pedidos está en `/`. El acceso del personal está en `/login`; el área interna protegida está en `/sistema`. El punto de venta y las herramientas administrativas requieren una sesión válida y permisos asignados por rol.

## Requisitos

- Node.js 18 o superior
- MongoDB local o una URI de MongoDB Atlas para guardar productos y ventas

## Iniciar en modo de prueba

1. Abrí una terminal en esta carpeta.
2. Ejecutá `npm install`.
3. Ejecutá `npm run dev`.
4. Abrí `http://localhost:5173`.

El modo de prueba incluye productos de ejemplo. Permite practicar búsqueda, escaneo, cantidades y cobros. Las ventas no se guardan de manera permanente. Los códigos de barras incluidos son datos de demostración; cargá y verificá los códigos reales del comercio antes de vender.

## Conectar MongoDB

1. Copiá `.env.example` a `.env`.
2. En `MONGODB_URI`, escribí la URI de tu base MongoDB.
3. Ejecutá `npm run seed` para cargar el catálogo de ejemplo (opcional).
4. Ejecutá `npm run dev`.

Con MongoDB conectado, el catálogo se lee de la base y cada venta se guarda como un registro con sus productos, precios, cantidades, total y medio de pago. El servidor vuelve al modo de prueba si no logra conectarse a MongoDB.

## Compilar y servir

`npm run build` genera los archivos web en `dist/`. `npm start` sirve la web compilada y la API en `http://localhost:4000`.

## Uso en caja

- El cursor se prepara en el campo «Buscar o escanear» al abrir la pantalla.
- Escaneá un código; la lectora envía Enter y agrega el producto. Repetir una lectura suma una unidad.
- Para buscar a mano, escribí parte del nombre y elegí una tarjeta. Enter agrega el primer resultado.
- Editá la cantidad con los controles o el campo numérico; el total se actualiza automáticamente.
- «Cobrar» permite elegir efectivo, Mercado Pago/QR, débito o crédito. Para efectivo, muestra el vuelto y no permite confirmar si falta dinero.
- «Cancelar venta» pide confirmación antes de vaciar la cuenta.

## Tecnologías

React, Vite, CSS, Node.js, Express y MongoDB con Mongoose.

## Administrar productos

Con MongoDB conectado, abrí el botón **Productos** en la parte superior para dar de alta artículos con nombre, código de barras, precio, categoría y detalle. También podés editar o quitar artículos; quitarlos los oculta del catálogo y conserva la información de las ventas anteriores. Los códigos de barras no pueden repetirse. Para cargar un producto con una lectora USB, escaneá el código en el campo «Código de barras» del formulario y completá el resto de los datos.

### Imágenes de productos con Cloudinary

Configurá `CLOUDINARY_URL` en `.env` y en las variables de entorno de Vercel, usando el valor **API Environment variable** del panel de Cloudinary (formato `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`). Tratala como una contraseña: solo la usa el servidor; no la compartas ni la incluyas en el frontend. Desde **Productos**, elegí «Subir imagen» o «Cambiar imagen» y seleccioná un archivo JPG, PNG, WEBP o AVIF de hasta 5 MB. La imagen se carga en Cloudinary y queda asociada al producto al guardar sus cambios.

## Pedidos del catálogo online

Los clientes pueden comprar como invitados; registrarse es opcional. Desde **Mi cuenta** pueden registrarse o iniciar sesión. Una cuenta permite reutilizar los datos de contacto y consultar pedidos anteriores; también se puede crear durante el checkout marcando **Crear una cuenta**. Para habilitar las cuentas, configurá `CUSTOMER_SESSION_SECRET` con un valor aleatorio de al menos 32 bytes en `.env` y en las variables de entorno de Vercel. En el sistema interno, el menú **Clientes** permite listar, crear, editar, reactivar y desactivar cuentas; desactivar bloquea las sesiones vigentes y conserva los pedidos asociados. Para dar acceso a la gestión de clientes se requiere el permiso `orders.manage`. Los pedidos requieren MongoDB y solo aceptan productos publicados en el catálogo online. El stock configurado se reserva al recibir el pedido y se devuelve al inventario si se cancela antes del despacho. En Vercel, verificá que `/api/health` indique `database: true` y que `/api/storefront/products` responda con un arreglo JSON. El catálogo público muestra solo productos activos, publicados online y con stock disponible o sin stock configurado.

En producción, las acciones públicas de realizar pedidos, registrarse e iniciar sesión requieren verificación con Cloudflare Turnstile. Creá un widget Turnstile para los dominios de la tienda y configurá `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` en `.env` y en las variables de entorno de Vercel; la clave secreta solo se utiliza en el servidor. Si la protección no está configurada en producción, estas acciones se bloquean. En otros servidores, definí también `TURNSTILE_REQUIRED=true` para exigirla aunque `NODE_ENV` no esté establecido. En desarrollo local, Turnstile queda opcional mientras no se configure ninguna de las claves ni `TURNSTILE_REQUIRED=true`.

El monto mínimo de compra inicial es **$10.000** y se puede modificar en **Pedidos online → Configuración de pedidos**. Se calcula sobre el subtotal de productos, antes del costo de envío, tanto para retiro como para entrega. Ingresá `0` para desactivarlo.

Ingresá el celular en formato nacional de 10 dígitos, por ejemplo `3816436214`, sin el `0` ni el `15`. En el checkout, el cliente debe elegir **Efectivo** o **Transferencia**; si elige efectivo, informa cuánto va a entregar y la web calcula el vuelto estimado. Para envíos, ese cálculo considera el subtotal de productos porque el costo de envío se confirma después. La transferencia no se cobra automáticamente: el local coordina los datos y confirma la acreditación con el cliente.

En **Pedidos online**, los nuevos pedidos se detectan automáticamente cada 3 segundos; el stock de la caja y el catálogo se actualiza cada 5 segundos, sin recargar la página. Presioná **Activar sonido** en Pedidos para habilitar la alerta audible; el navegador requiere esa acción del usuario. Administración puede confirmar, preparar, marcar listo y completar o cancelar los pedidos. El botón de WhatsApp abre un mensaje prellenado con el detalle, medio de pago e importe en efectivo para que el personal lo revise y lo envíe manualmente; no se envían mensajes automáticos.

La cobertura inicial usa el punto `-26.866183, -65.210705` y un radio de 1.000 metros. Se puede ajustar el radio y el punto del local en **Pedidos online**. El cliente debe indicar su dirección y marcar el punto de entrega dentro del círculo del mapa. El mapa usa Leaflet y OpenStreetMap.


## Acceso administrativo e inventario

La administración usa cuentas individuales con roles y sesiones HttpOnly (8 horas). Configurá `ADMIN_SESSION_SECRET` y `ADMIN_BOOTSTRAP_TOKEN` en `.env` y en las variables de entorno de Vercel. Generá ambos con valores aleatorios largos (32 bytes o más) y no los subas a Git.

#### Alta del propietario inicial

Mientras la colección de usuarios esté vacía, el token permite crear una única cuenta `propietario`:

```http
POST /api/auth/bootstrap
Content-Type: application/json

{
  "bootstrapToken": "PEGAR_ADMIN_BOOTSTRAP_TOKEN",
  "username": "franco",
  "displayName": "Franco Osman",
  "password": "UNA_CONTRASENA_LARGA_DE_12_CARACTERES_O_MAS"
}
```

Ejemplo con cURL:

```bash
curl -X POST http://localhost:4000/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"bootstrapToken":"PEGAR_ADMIN_BOOTSTRAP_TOKEN","username":"franco","displayName":"Franco Osman","password":"UNA_CONTRASENA_LARGA_DE_12_CARACTERES_O_MAS"}'
```

El primer usuario queda como propietario. Iniciá sesión en `/login` y abrí **Usuarios y roles** para crear cuentas internas. No hay registro público para cuentas del personal: solo un usuario con permisos puede crearlas. Para crear otro administrador, enviá `POST /api/users` con la cookie de sesión y este cuerpo:

```json
{
  "username": "encargada",
  "displayName": "Encargada del local",
  "password": "OTRA_CONTRASENA_LARGA_DE_12_CARACTERES",
  "role": "administracion"
}
```

La misma sección ofrece los roles `administracion`, `inventario` y `etiquetas`. Solo el propietario puede asignar otro propietario; las cuentas se pueden editar, restablecer su contraseña o desactivar. No se puede desactivar el último propietario activo.

Los endpoints principales son `POST /api/auth/login` (`username`, `password`), `POST /api/auth/logout`, `GET /api/auth/status`, `GET /api/users`, `POST /api/users` y `PUT /api/users/:id`. La gestión de clientes usa `GET /api/customers?status=active|inactive|all`, `POST /api/customers`, `PUT /api/customers/:id` y `DELETE /api/customers/:id`; el último desactiva la cuenta en lugar de borrar el registro. Contraseñas con mínimo 12 caracteres.

El acceso a productos/costos, inventario, etiquetas, combos, reportes y usuarios se valida en el servidor según permisos del rol. La interfaz interna y `POST /api/sales` requieren sesión y permiso `sales.create` (propietario o administración); autorizar ventas con stock insuficiente requiere además `stock.override`. Los endpoints del catálogo público exponen únicamente productos publicados para clientes.
