export const demoProducts = [
  { name: 'Coca-Cola 2.25 L', detail: 'Botella grande', barcode: '7790895000993', price: 3400, category: 'Bebidas' },
  { name: 'Yerba Playadito 1 kg', detail: 'Paquete amarillo', barcode: '7793704000018', price: 4200, category: 'Almacén' },
  { name: 'Alfajor Havanna', detail: 'Mar del Plata', barcode: '7798123200124', price: 1800, category: 'Golosinas' },
  { name: 'Galletitas Chocolinas', detail: 'Paquete de 250 gramos', barcode: '7622300852804', price: 1650, category: 'Galletitas' },
  { name: 'Agua Mineral 1.5 L', detail: 'Sin gas', barcode: '7798062540103', price: 1450, category: 'Bebidas' },
  { name: 'Don Satur Grasa', detail: 'Bizcochitos clásicos', barcode: '7790040990010', price: 1100, category: 'Galletitas' },
  { name: 'Queso Cremoso', detail: 'Trozado La Paulina', barcode: '2000000000007', price: 2900, category: 'Fiambres' },
  { name: 'Leche Entera 1 L', detail: 'Sachet La Serenísima', barcode: '7790742301203', price: 1350, category: 'Lácteos' },
  { name: 'Papas Lays Clásicas', detail: 'Bolsa mediana', barcode: '7790310000015', price: 2300, category: 'Snacks' },
].map((product) => ({ ...product, isDemo: true }));
