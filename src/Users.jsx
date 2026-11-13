import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus, RefreshCw, Save, Shield, Trash2, UserRound, X } from 'lucide-react';

const roles = [
  ['administracion', 'Administración', 'Acceso completo y gestión de usuarios.'],
  ['inventario', 'Inventario', 'Productos, ingresos, ajustes y movimientos de stock.'],
  ['etiquetas', 'Etiquetas', 'Organización e impresión de listas de precios.'],
];
const blankUser = { username: '', displayName: '', password: '', role: 'etiquetas', active: true };

export default function Users({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(blankUser);
  const [editingId, setEditingId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const availableRoles = currentUser?.role === 'propietario' ? [...roles, ['propietario', 'Propietario', 'Control total y administración de cuentas.']] : roles;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users');
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'No se pudieron cargar los usuarios.');
      setUsers(data); setMessage('');
    } catch (error) { setMessage(error.message || 'No se pudieron cargar los usuarios.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const closeModal = () => { if (saving) return; setModalOpen(false); setEditingId(''); setForm(blankUser); };
  const createUser = () => { setEditingId(''); setForm(blankUser); setMessage(''); setModalOpen(true); };
  const edit = (user) => {
    setEditingId(String(user._id));
    setForm({ username: user.username, displayName: user.displayName, password: '', role: user.role, active: user.active });
    setMessage(''); setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const response = await fetch(editingId ? `/api/users/${editingId}` : '/api/users', {
        method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo guardar el usuario.');
      setModalOpen(false); setForm(blankUser); setEditingId('');
      await reload(); setMessage('Usuario guardado correctamente.');
    } catch (error) { setMessage(error.message || 'No se pudo guardar el usuario.'); }
    finally { setSaving(false); }
  };

  const remove = async (user) => {
    if (!window.confirm(`¿Eliminar definitivamente a ${user.displayName}? No podrá volver a iniciar sesión.`)) return;
    setMessage('');
    try {
      const response = await fetch(`/api/users/${user._id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo eliminar el usuario.');
      await reload(); setMessage('Usuario eliminado.');
    } catch (error) { setMessage(error.message || 'No se pudo eliminar el usuario.'); }
  };

  return <main className="products-page users-page"><section className="products-modal">
    <div className="modal-heading"><div><h2>Usuarios y roles</h2><p>Creá accesos individuales y asigná qué sectores puede utilizar cada persona.</p></div><div className="users-heading-actions"><button className="catalog-refresh" type="button" onClick={reload} aria-label="Actualizar usuarios"><RefreshCw size={17} /></button><button className="add-user-button" type="button" onClick={createUser}><Plus size={17} /> Nuevo usuario</button></div></div>
    <div className="user-role-guide">{roles.map(([role, title, description]) => <article key={role}><Shield size={17} /><div><strong>{title}</strong><span>{description}</span></div></article>)}</div>
    {message && <p className="users-message" role="status">{message}</p>}
    <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead><tbody>
      {users.map((user) => <tr key={user._id}><td data-label="Usuario"><strong>{user.displayName}</strong><small>@{user.username}</small></td><td data-label="Rol">{[...roles, ['propietario', 'Propietario']].find(([role]) => role === user.role)?.[1]}</td><td data-label="Estado"><span className={`user-state ${user.active ? 'enabled' : ''}`}>{user.active ? 'Activo' : 'Desactivado'}</span></td><td data-label="Último acceso">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('es-AR') : 'Sin ingresos'}</td><td data-label="Acciones"><div className="user-row-actions"><button type="button" className="user-edit-button" disabled={user.role === 'propietario' && currentUser?.role !== 'propietario'} onClick={() => edit(user)} aria-label={`Editar ${user.displayName}`}><Pencil size={15} /> Editar</button><button type="button" className="user-delete-button" disabled={String(user._id) === String(currentUser?.id) || (user.role === 'propietario' && currentUser?.role !== 'propietario')} onClick={() => remove(user)} aria-label={`Eliminar ${user.displayName}`}><Trash2 size={15} /> Eliminar</button></div></td></tr>)}
      {!loading && !users.length && <tr><td colSpan="5" className="catalog-empty">Todavía no hay usuarios.</td></tr>}
      {loading && <tr><td colSpan="5" className="catalog-empty">Cargando usuarios…</td></tr>}
    </tbody></table></div>
    <p className="users-security-note">Las cuentas eliminadas no pueden volver a iniciar sesión. Debe quedar al menos un propietario activo.</p>
  </section>
  {modalOpen && <div className="modal-backdrop user-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
    <section className="products-modal user-editor-modal" role="dialog" aria-modal="true" aria-labelledby="user-form-title">
      <div className="modal-heading"><div><h2 id="user-form-title">{editingId ? 'Editar usuario' : 'Crear usuario'}</h2><p>La contraseña debe tener al menos 12 caracteres.</p></div><button className="modal-close" type="button" onClick={closeModal} aria-label="Cerrar"><X size={20} /></button></div>
      <form className="user-form" onSubmit={submit}>
        <label>Nombre visible<input required maxLength="80" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Ej.: María Gómez" /></label>
        <label>Usuario<input required minLength="3" maxLength="254" autoComplete="username" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} placeholder="usuario o correo@dominio.com" /></label>
        <label>Rol<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{availableRoles.map(([role, title]) => <option key={role} value={role}>{title}</option>)}</select></label>
        <label className="user-password-field">{editingId ? 'Nueva contraseña (opcional)' : 'Contraseña'}<span><KeyRound size={16} /><input required={!editingId} minLength="12" maxLength="200" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editingId ? 'Dejar vacía para conservarla' : 'Mínimo 12 caracteres'} /></span></label>
        {editingId && <label className="user-active-toggle"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Cuenta habilitada</label>}
        {message && <p className="users-message" role="alert">{message}</p>}
        <div className="user-form-actions"><button className="confirm-payment" type="submit" disabled={saving}><Save size={17} />{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear usuario'}</button><button className="back-to-sale" type="button" onClick={closeModal}>Cancelar</button></div>
      </form>
    </section>
  </div>}
  </main>;
}