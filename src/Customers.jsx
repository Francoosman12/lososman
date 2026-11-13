import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, RefreshCw, Save, Search, Trash2, UserRound, X } from 'lucide-react';

const blankCustomer = { fullName: '', phone: '', email: '', address: '', deliveryNote: '', password: '', active: true };
const normalizeText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(blankCustomer);
  const [editingId, setEditingId] = useState('');
  const [filter, setFilter] = useState('active');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/customers?status=${filter}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'No se pudieron cargar los clientes.');
      setCustomers(data);
      setNotice(null);
      return true;
    } catch (error) {
      setNotice({ tone: 'error', text: error.message || 'No se pudieron cargar los clientes.' });
      return false;
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { reload(); }, [reload]);

  const visibleCustomers = useMemo(() => {
    const search = normalizeText(query);
    if (!search) return customers;
    return customers.filter((customer) => normalizeText([
      customer.fullName, customer.phone, customer.email, customer.address,
    ].join(' ')).includes(search));
  }, [customers, query]);

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId('');
    setForm(blankCustomer);
  };

  const createCustomer = () => {
    setEditingId('');
    setForm(blankCustomer);
    setNotice(null);
    setModalOpen(true);
  };

  const editCustomer = (customer) => {
    setEditingId(String(customer._id));
    setForm({
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      address: customer.address || '',
      deliveryNote: customer.deliveryNote || '',
      password: '',
      active: customer.active,
    });
    setNotice(null);
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(editingId ? `/api/customers/${editingId}` : '/api/customers', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo guardar el cliente.');
      setModalOpen(false);
      setEditingId('');
      setForm(blankCustomer);
      if (await reload()) setNotice({ tone: 'success', text: 'Cliente guardado correctamente.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error.message || 'No se pudo guardar el cliente.' });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (customer) => {
    if (!window.confirm(`¿Desactivar la cuenta de ${customer.fullName}? No podrá iniciar sesión y sus pedidos se conservarán.`)) return;
    setNotice(null);
    try {
      const response = await fetch(`/api/customers/${customer._id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo desactivar el cliente.');
      if (await reload()) setNotice({ tone: 'success', text: 'Cuenta desactivada. El historial de pedidos se conservó.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error.message || 'No se pudo desactivar el cliente.' });
    }
  };

  const filteredStatus = filter === 'all' ? 'Todas las cuentas' : filter === 'inactive' ? 'Cuentas desactivadas' : 'Cuentas activas';

  return <main className="products-page users-page customers-page"><section className="products-modal">
    <div className="modal-heading">
      <div><h2>Clientes</h2><p>Administrá las cuentas de clientes. Los pedidos y su historial se conservan al desactivar una cuenta.</p></div>
      <div className="users-heading-actions">
        <button className="catalog-refresh" type="button" onClick={reload} aria-label="Actualizar clientes"><RefreshCw size={17} /></button>
        <button className="add-user-button" type="button" onClick={createCustomer}><Plus size={17} /> Nuevo cliente</button>
      </div>
    </div>
    {notice && <p className={`customers-message ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
    <div className="customers-toolbar">
      <label className="customers-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, celular, correo o dirección" /></label>
      <label className="customers-filter">Estado
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="active">Activos</option>
          <option value="inactive">Desactivados</option>
          <option value="all">Todos</option>
        </select>
      </label>
    </div>
    <div className="users-table-wrap"><table className="users-table customers-table"><thead><tr><th>Cliente</th><th>Celular</th><th>Pedidos</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {visibleCustomers.map((customer) => <tr key={customer._id}>
        <td data-label="Cliente"><strong>{customer.fullName}</strong><small>{customer.email}</small>{customer.address && <small>{customer.address}</small>}</td>
        <td data-label="Celular">{customer.phone}</td>
        <td data-label="Pedidos"><strong>{customer.orderCount || 0}</strong><small>{customer.lastOrderAt ? `Último: ${new Date(customer.lastOrderAt).toLocaleDateString('es-AR')}` : 'Sin pedidos vinculados'}</small></td>
        <td data-label="Estado"><span className={`user-state ${customer.active ? 'enabled' : ''}`}>{customer.active ? 'Activo' : 'Desactivado'}</span></td>
        <td data-label="Acciones"><div className="user-row-actions">
          <button type="button" className="user-edit-button" onClick={() => editCustomer(customer)} aria-label={`Editar ${customer.fullName}`}><Pencil size={15} /> Editar</button>
          {customer.active && <button type="button" className="user-delete-button" onClick={() => deactivate(customer)} aria-label={`Desactivar ${customer.fullName}`}><Trash2 size={15} /> Desactivar</button>}
        </div></td>
      </tr>)}
      {!loading && !visibleCustomers.length && <tr><td colSpan="5" className="catalog-empty">{customers.length ? 'No hay clientes que coincidan con la búsqueda.' : `No hay clientes en “${filteredStatus}”.`}</td></tr>}
      {loading && <tr><td colSpan="5" className="catalog-empty">Cargando clientes…</td></tr>}
    </tbody></table></div>
    <p className="users-security-note"><UserRound size={15} /> Se muestran hasta 500 cuentas por filtro. Desactivar bloquea también las sesiones iniciadas.</p>
  </section>
  {modalOpen && <div className="modal-backdrop user-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
    <section className="products-modal user-editor-modal" role="dialog" aria-modal="true" aria-labelledby="customer-form-title">
      <div className="modal-heading"><div><h2 id="customer-form-title">{editingId ? 'Editar cliente' : 'Crear cliente'}</h2><p>Celular con 10 dígitos, sin 0 ni 15. Si cambiás la dirección, el cliente deberá volver a marcar su ubicación al pedir.</p></div><button className="modal-close" type="button" onClick={closeModal} aria-label="Cerrar"><X size={20} /></button></div>
      <form className="user-form customer-form" onSubmit={submit}>
        <label>Nombre completo<input required maxLength="120" autoComplete="name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
        <label>Celular / WhatsApp<input required type="tel" inputMode="numeric" autoComplete="tel-national" maxLength="24" placeholder="3816436214" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label>Correo electrónico<input required type="email" autoComplete="email" maxLength="254" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Dirección<input maxLength="240" autoComplete="street-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
        <label className="customer-note-field">Indicaciones de entrega<input maxLength="500" value={form.deliveryNote} onChange={(event) => setForm({ ...form, deliveryNote: event.target.value })} /></label>
        <label className="user-password-field">{editingId ? 'Restablecer contraseña (opcional)' : 'Contraseña inicial'}<span><KeyRound size={16} /><input required={!editingId} minLength="12" maxLength="200" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={editingId ? 'Dejar vacía para conservarla' : 'Mínimo 12 caracteres'} /></span></label>
        {!editingId && <p className="customer-password-note">Compartí la contraseña inicial con el cliente por un canal privado.</p>}
        {editingId && <label className="user-active-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Cuenta habilitada</label>}
        {notice?.tone === 'error' && <p className="customers-message error" role="alert">{notice.text}</p>}
        <div className="user-form-actions"><button className="confirm-payment" type="submit" disabled={saving}><Save size={17} />{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear cliente'}</button><button className="back-to-sale" type="button" onClick={closeModal}>Cancelar</button></div>
      </form>
    </section>
  </div>}
  </main>;
}
