import { useEffect, useState } from 'react';
import { PackagePlus, RefreshCw, X } from 'lucide-react';

export default function Inventory({ products = [], onUpdated = () => {} }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [type, setType] = useState('purchase');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [movements, setMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(true);

  const loadMovements = async () => {
    setLoadingMovements(true);
    try { const response = await fetch('/api/inventory/movements'); const data = await response.json().catch(() => []); if (response.ok) setMovements(data); }
    finally { setLoadingMovements(false); }
  };
  useEffect(() => { loadMovements(); }, []);
  const filtered = products.filter((product) => `${product.name} ${product.barcode || ''}`.toLocaleLowerCase('es-AR').includes(query.toLocaleLowerCase('es-AR')));
  const openMovement = (product) => { setSelected(product); setQuantity(''); setReason(''); setType('purchase'); setMessage(''); setModalOpen(true); };
  const closeMovement = () => { if (busy) return; setModalOpen(false); setSelected(null); };
  const submit = async (event) => {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/products/${selected._id}/stock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: Number(quantity), reason, type }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo actualizar el stock.');
      setModalOpen(false); setSelected(null); setMessage(`Stock actualizado: ${result.stock} unidades.`);
      await onUpdated(); await loadMovements();
    } catch (error) { setMessage(error.message || 'No se pudo actualizar el stock.'); }
    finally { setBusy(false); }
  };
  return <main className="products-page inventory-page"><section className="products-modal">
    <div className="modal-heading"><div><h2>Inventario</h2><p>Buscá un producto para registrar una compra, devolución, pérdida o ajuste.</p></div><button className="catalog-refresh" type="button" onClick={loadMovements} aria-label="Actualizar movimientos"><RefreshCw size={17} /></button></div>
    {message && <p className="users-message" role="status">{message}</p>}
    <section className="inventory-product-picker"><label>Buscar producto<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre o código de barras" /></label><div className="inventory-product-list">{filtered.map((product) => <button type="button" key={product._id} onClick={() => openMovement(product)}><span><strong>{product.name}</strong><small>{product.barcode || 'Sin EAN'}</small></span><span className="inventory-row-stock">{Number.isInteger(product.stock) ? `${product.stock} un.` : 'Sin configurar'}<PackagePlus size={16} /></span></button>)}{!filtered.length && <p className="catalog-empty">No hay coincidencias.</p>}</div></section>
    <h3 className="inventory-history-title">Movimientos recientes</h3><div className="users-table-wrap"><table className="users-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Movimiento</th><th>Cantidad</th><th>Stock final</th><th>Motivo</th></tr></thead><tbody>{movements.map((row) => <tr key={row._id}><td data-label="Fecha">{new Date(row.createdAt).toLocaleString('es-AR')}</td><td data-label="Producto">{row.productName}</td><td data-label="Movimiento">{row.type === 'purchase' ? 'Compra' : row.type === 'return' ? 'Devolución' : row.type === 'loss' ? 'Pérdida' : row.type}</td><td data-label="Cantidad">{row.quantity > 0 ? '+' : ''}{row.quantity}</td><td data-label="Stock final">{row.stockAfter}</td><td data-label="Motivo">{row.reason}</td></tr>)}{loadingMovements && <tr><td colSpan="6" className="catalog-empty">Cargando…</td></tr>}{!loadingMovements && !movements.length && <tr><td colSpan="6" className="catalog-empty">Sin movimientos registrados.</td></tr>}</tbody></table></div>
  </section>
  {modalOpen && selected && <div className="modal-backdrop inventory-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMovement(); }}><section className="products-modal inventory-editor-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-modal-title">
    <div className="modal-heading"><div><h2 id="inventory-modal-title">Registrar movimiento</h2><p>{selected.name} · Stock actual: {Number.isInteger(selected.stock) ? selected.stock : 'sin configurar'}</p></div><button className="modal-close" type="button" onClick={closeMovement} aria-label="Cerrar"><X size={20} /></button></div>
    <form className="inventory-form" onSubmit={submit}><label>Tipo de movimiento<select value={type} onChange={(e) => setType(e.target.value)}><option value="purchase">Ingreso de compra</option><option value="return">Devolución</option><option value="loss">Pérdida o merma</option></select></label><label>{type === 'loss' ? 'Unidades perdidas' : 'Cantidad de unidades'}<input type="number" min="1" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label><label>Motivo<input required maxLength="240" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: compra al proveedor" /></label>{message && <p className="users-message" role="alert">{message}</p>}<div className="user-form-actions"><button className="confirm-payment" disabled={busy}>{busy ? 'Guardando…' : 'Registrar movimiento'}</button><button className="back-to-sale" type="button" onClick={closeMovement}>Cancelar</button></div></form>
  </section></div>}
  </main>;
}