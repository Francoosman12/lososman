import { useEffect, useState } from 'react';

const money = (amount) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(amount) || 0);
const today = new Date();
const dateInput = (date) => date.toISOString().slice(0, 10);
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

export default function Reports({ products = [] }) {
  const [from, setFrom] = useState(dateInput(monthStart));
  const [to, setTo] = useState(dateInput(today));
  const [category, setCategory] = useState('');
  const [productId, setProductId] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (category) params.set('category', category);
    if (productId) params.set('productId', productId);
    setLoading(true);
    fetch('/api/reports/summary?' + params.toString())
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || 'No se pudieron cargar los reportes.');
        return data;
      })
      .then((data) => { if (!cancelled) { setReport(data); setError(''); } })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || 'No se pudieron cargar los reportes.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, category, productId]);

  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es-AR'));
  const inventory = report?.inventory;
  const period = report?.period;

  return (
    <main className="products-page reports-page">
      <section className="products-modal">
        <div className="modal-heading"><div><h2>Reportes y rentabilidad</h2><p>Indicadores calculados con las ventas y los costos disponibles.</p></div></div>
        <div className="report-filters">
          <label>Desde<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Hasta<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
          <label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label>Producto<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Todos</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}</select></label>
        </div>
        {error && <div className="catalog-warning" role="alert">{error}</div>}
        {loading && !report && <p className="report-loading">Calculando reportes…</p>}
        {report && <>
          <h3 className="report-section-title">Inventario</h3>
          <div className="report-cards">
            <article><span>Valor a costo conocido</span><strong>{money(inventory.inventoryCostValue)}</strong><small>{inventory.productsWithoutCost} productos sin costo informado</small></article>
            <article><span>Valor potencial a venta</span><strong>{money(inventory.inventorySalesValue)}</strong><small>Solo unidades con seguimiento de stock</small></article>
            <article><span>Productos activos</span><strong>{inventory.activeProducts}</strong></article>
            <article><span>Stock bajo el mínimo</span><strong>{inventory.lowStock}</strong></article>
            <article><span>Sin stock</span><strong>{inventory.outOfStock}</strong></article>
            <article><span>Stock sin configurar</span><strong>{inventory.untracked}</strong></article>
          </div>
          <h3 className="report-section-title">Ventas del período</h3>
          <div className="report-cards">
            <article><span>Facturación registrada</span><strong>{money(period.revenue)}</strong></article>
            <article><span>Ventas</span><strong>{period.salesCount}</strong><small>Local: {period.channels.pos} · Online: {period.channels.online}</small></article>
            <article><span>Unidades vendidas</span><strong>{period.unitsSold}</strong></article>
            <article className="report-profit"><span>Ganancia bruta estimada</span><strong>{money(period.grossProfit)}</strong><small>{period.costMissingLines} líneas sin costo histórico</small></article>
          </div>
          <p className="report-disclaimer">La ganancia bruta no descuenta gastos operativos ni impuestos. La rentabilidad neta no puede calcularse con precisión sin esos datos.</p>
          <div className="report-tables">
            <section><h3>Productos con más rotación</h3><div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Producto</th><th>Unidades</th><th>Importe estimado</th></tr></thead><tbody>{report.topProducts.map((row) => <tr key={row.productId}><td data-label="Producto">{row.name}</td><td data-label="Unidades">{row.units}</td><td data-label="Importe estimado">{money(row.revenue)}</td></tr>)}{!report.topProducts.length && <tr><td colSpan="3" className="catalog-empty">No hay ventas en este período.</td></tr>}</tbody></table></div></section>
            <section><h3>Productos por margen bruto</h3><div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Producto</th><th>Margen</th><th>Precio / costo</th></tr></thead><tbody>{report.topMargins.map((row) => <tr key={row.productId}><td data-label="Producto">{row.name}</td><td data-label="Margen">{row.margin.toFixed(1)}%</td><td data-label="Precio / costo">{money(row.price)} / {money(row.cost)}</td></tr>)}{!report.topMargins.length && <tr><td colSpan="3" className="catalog-empty">Completá costos para calcular los márgenes.</td></tr>}</tbody></table></div></section>
            <section><h3>Debajo del margen objetivo</h3><div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Producto</th><th>Actual</th><th>Objetivo</th></tr></thead><tbody>{report.belowTarget.map((row) => <tr key={row.productId}><td data-label="Producto">{row.name}</td><td data-label="Actual">{row.margin.toFixed(1)}%</td><td data-label="Objetivo">{row.targetMargin.toFixed(1)}%</td></tr>)}{!report.belowTarget.length && <tr><td colSpan="3" className="catalog-empty">No hay productos por debajo del margen configurado.</td></tr>}</tbody></table></div></section>
            <section><h3>Rentabilidad de combos</h3><div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Combo</th><th>Vendidos</th><th>Ganancia bruta</th></tr></thead><tbody>{report.comboPerformance.map((row) => <tr key={row.name}><td data-label="Combo">{row.name}</td><td data-label="Vendidos">{row.units}</td><td data-label="Ganancia bruta">{money(row.grossProfit)}</td></tr>)}{!report.comboPerformance.length && <tr><td colSpan="3" className="catalog-empty">No se vendieron combos en este período.</td></tr>}</tbody></table></div></section>
          </div>
        </>}
      </section>
    </main>
  );
}