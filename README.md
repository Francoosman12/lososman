# Los Osman · Punto de venta

Punto de venta simple inspirado en el diseño de Google Stitch. Está preparado para usar un lector de códigos USB que escribe el código y termina con Enter.

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
