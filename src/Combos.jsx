import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';

const money = (amount) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(amount) || 0);
const dateValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';

const blankCombo = () => ({ name: '', description: '', price: '', startsAt: '', endsAt: '', active: true, published: false, components: [] });

export default function Combos({ products = [], onSaved = () => {} }) {
  const [combos, setCombos] = useState([]);
  const [form, setForm] = useState(blankCombo);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const productById = useMemo(() => new Map(products.map((product) => [String(product._id), product])), [products]);
  const formComponents = form.components.map((component) => ({ ...component, product: productById.get(String(component.productId)) })).filter((component) => component.product);
  const totalCost = formComponents.length > 0 && formComponents.every((component) => Number.isFinite(component.product.cost))
    ? formComponents.reduce((sum, component) => sum + (component.product.cost + (component.product.additionalCost || 0)) * Number(component.quantity || 0), 0)
    : null;
  const grossProfit = totalCost === null || form.price === '' ? null : Number(form.price) - totalCost;
  const grossMargin = grossProfit !== null && Number(form.price) > 0 ? (grossProfit / Number(form.price)) * 100 : null;
  const maximumCombos = formComponents.length > 0 && formComponents.every((component) => Number.isInteger(component.product.stock))
    ? Math.min(...formComponents.map((component) => Math.floor(component.product.stock / Number(component.quantity || 1))))
    : null;

  const reload = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/combos');
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'No se pudieron cargar los combos.');
      setCombos(Array.isArray(data) ? data : []);
      setMessage('');
    } catch (error) { setMessage(error.message || 'No se pudieron cargar los combos.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const startEdit = (combo) => {
    setEditingId(String(combo._id));
    setForm({
      name: combo.name, description: combo.description || '', price: String(combo.price),
      startsAt: dateValue(combo.startsAt), endsAt: dateValue(combo.endsAt),
      active: combo.active, published: combo.published,
      components: combo.components.map((component) => ({ productId: String(component.productId), quantity: component.quantity })),
    });
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveCombo = async (event) => {
    event.preventDefault();
    if (!form.components.length || form.components.some((component) => !component.productId || Number(component.quantity) < 1)) {
      setMessage('Agregá al menos un producto y definí sus cantidades.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const body = {
        ...form,
        price: Number(form.price),
        startsAt: form.startsAt ? form.startsAt + 'T00:00:00.000Z' : null,
        endsAt: form.endsAt ? form.endsAt + 'T23:59:59.999Z' : null,
        components: form.components.map((component) => ({ ...component, quantity: Number(component.quantity) })),
      };
      const response = await fetch(editingId ? '/api/combos/' + editingId : '/api/combos', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo guardar el combo.');
      setForm(blankCombo());
      setEditingId('');
      await reload();
      await onSaved();
    } catch (error) { setMessage(error.message || 'No se pudo guardar el combo.'); }
    finally { setSaving(false); }
  };

  const removeCombo = async (combo) => {
    if (!window.confirm('¿Eliminar el combo "' + combo.name + '"? Las ventas históricas se conservan.')) return;
    try {
      const response = await fetch('/api/combos/' + combo._id, { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo eliminar el combo.');
      await reload();
      await onSaved();
    } catch (error) { setMessage(error.message || 'No se pudo eliminar el combo.'); }
  };

  const addComponent = () => setForm((current) => ({
    ...current,
    components: [...current.components, { productId: String(products[0]?._id || ''), quantity: 1 }],
  }));
  const changeComponent = (index, key, value) => setForm((current) => ({
    ...current,
    components: current.components.map((component, itemIndex) => itemIndex === index ? { ...component, [key]: value } : component),
  }));
  const removeComponent = (index) => setForm((current) => ({
    ...current, components: current.components.filter((_, itemIndex) => itemIndex !== index),
  }));

  return (
    <main className="products-page combos-page">
      <section className="products-modal">
        <div className="modal-heading"><div><h2>Combos y promociones</h2><p>Combiná artículos del inventario. El stock se descuenta de sus productos.</p></div><button className="add-user-button" type="button" onClick={() => { setEditingId(''); setForm(blankCombo()); setMessage(''); setModalOpen(true); }}><Plus size={17} /> Crear combo</button></div>
        {message && !modalOpen && <p className="combo-notice" role="status">{message}</p>}
        {modalOpen && <div className="modal-backdrop combo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setModalOpen(false); setEditingId(''); setForm(blankCombo()); setMessage(''); } }}>
          <section className="products-modal combo-editor-modal" role="dialog" aria-modal="true" aria-labelledby="combo-form-title">
            <div className="modal-heading"><div><h2 id="combo-form-title">{editingId ? 'Editar combo' : 'Crear combo'}</h2><p>Definí sus productos, precio y vigencia.</p></div><button className="modal-close" type="button" disabled={saving} onClick={() => { setModalOpen(false); setEditingId(''); setForm(blankCombo()); setMessage(''); }} aria-label="Cerrar"><X size={20} /></button></div>
            <form className="combo-form" onSubmit={saveCombo}>
          <label>Nombre del combo<input required maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej.: Combo de fin de semana" /></label>
          <label>Descripción<input maxLength="500" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Detalle opcional" /></label>
          <label>Precio promocional<input required type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
          <div className="combo-dates"><label>Desde<input type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label><label>Hasta<input type="date" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label></div>
          <div className="combo-components">
            <div className="admin-list-heading"><strong>Productos del combo</strong><button type="button" onClick={addComponent} disabled={!products.length}><Plus size={15} /> Agregar producto</button></div>
            {!form.components.length && <p className="combo-empty">Todavía no agregaste componentes.</p>}
            {form.components.map((component, index) => <div className="combo-component-row" key={index}>
              <select aria-label="Producto componente" value={component.productId} onChange={(event) => changeComponent(index, 'productId', event.target.value)}>
                {products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
              </select>
              <label>Cantidad<input aria-label="Cantidad del componente" required type="number" min="1" max="10000" step="1" value={component.quantity} onChange={(event) => changeComponent(index, 'quantity', event.target.value)} /></label>
              <button type="button" className="combo-remove" onClick={() => removeComponent(index)} aria-label="Quitar componente"><X size={16} /></button>
            </div>)}
          </div>
          <div className="combo-summary">
            <div><span>Costo total estimado</span><strong>{totalCost === null ? 'Completá los costos de sus productos' : money(totalCost)}</strong></div>
            <div><span>Ganancia bruta estimada</span><strong>{grossProfit === null ? '—' : money(grossProfit)}</strong></div>
            <div><span>Margen bruto</span><strong>{grossMargin === null ? '—' : grossMargin.toFixed(1) + '%'}</strong></div>
            <div><span>Combos disponibles</span><strong>{maximumCombos === null ? 'Stock sin configurar' : Math.max(0, maximumCombos)}</strong></div>
          </div>
          <label className="combo-check"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Activo en el punto de venta</label>
          <label className="combo-check"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} />Publicar en el catálogo online</label>
          {message && <p className="combo-message" role="status">{message}</p>}
          <div className="product-form-actions"><button className="confirm-payment" type="submit" disabled={saving || !products.length}><Check size={18} />{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear combo'}</button>{editingId && <button type="button" className="back-to-sale" onClick={() => { setEditingId(''); setForm(blankCombo()); }}>Cancelar</button>}</div>
            </form>
          </section>
        </div>}
        <div className="product-admin-list">
          <div className="admin-list-heading"><strong>Combos creados</strong><span>{combos.length}</span></div>
          {loading && <p className="combo-empty">Cargando combos…</p>}
          {!loading && combos.map((combo) => <article className="combo-list-card" key={combo._id}>
            <div><strong>{combo.name}</strong><p>{combo.components.map((component) => component.quantity + ' × ' + component.name).join(' · ')}</p><small>{combo.active ? 'Activo' : 'Inactivo'} · {combo.published ? 'Publicado' : 'No publicado'} · {combo.availableQuantity == null ? 'stock no configurado' : combo.availableQuantity + ' combos posibles'}</small></div>
            <div className="combo-list-price"><strong>{money(combo.price)}</strong><button type="button" onClick={() => startEdit(combo)} aria-label="Editar combo"><Pencil size={16} /></button><button type="button" className="admin-delete" onClick={() => removeCombo(combo)} aria-label="Eliminar combo"><Trash2 size={16} /></button></div>
          </article>)}
          {!loading && !combos.length && <p className="combo-empty">Todavía no hay combos guardados.</p>}
        </div>
      </section>
    </main>
  );
}