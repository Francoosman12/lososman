import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock3, MapPin, MessageCircle, PackageCheck, RefreshCw, Save, Store, Truck, Volume2, VolumeX, X } from 'lucide-react';
import DeliveryMap from './DeliveryMap.jsx';
import { normalizeArgentinaMobile } from '../shared/phone.js';

const money = (amount) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(amount) || 0);
const labels = {
  pending: 'Recibido', confirmed: 'Confirmado', preparing: 'Preparando', ready: 'Listo',
  out_for_delivery: 'En camino', delivered: 'Entregado', picked_up: 'Retirado', cancelled: 'Cancelado',
};
const paymentMethodLabel = (order) => order.paymentType === 'cash' ? 'Efectivo'
  : order.paymentType === 'transfer' ? 'Transferencia'
    : 'A coordinar (pedido anterior)';
const nextStates = (order) => ({
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: [order.fulfillment === 'delivery' ? 'out_for_delivery' : 'picked_up', 'cancelled'],
  out_for_delivery: ['delivered'],
}[order.status] || []);

const waLink = (order) => {
  const phone = `549${normalizeArgentinaMobile(order.phone)}`;
  const items = order.items.map((item) => `- ${item.quantity} × ${item.name}: ${money(item.price * item.quantity)}`).join('\n');
  const payment = order.paymentType === 'cash'
    ? `Medio de pago: efectivo\nAbona con: ${money(order.cashAmountTendered)}\nVuelto estimado sobre productos: ${money(Math.max(0, Number(order.cashAmountTendered) - Number(order.total)))}`
    : order.paymentType === 'transfer'
      ? 'Medio de pago: transferencia (coordinar datos y acreditación)'
      : 'Medio de pago: a coordinar';
  const text = `Hola ${order.customerName}, te contactamos por tu pedido ${order.orderNumber} de Los Osman.\n\nDetalle del pedido:\n${items}\n\nSubtotal: ${money(order.total)}\n${payment}\nEstado: ${labels[order.status] || order.status}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [config, setConfig] = useState({ storeLatitude: -26.866183, storeLongitude: -65.210705, radiusMeters: 1000, minimumOrderAmount: 10000 });
  const [centerMarker, setCenterMarker] = useState(null);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [newOrderAlert, setNewOrderAlert] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef(null);
  const soundEnabledRef = useRef(false);
  const knownOrderIdsRef = useRef(null);
  const loadingRef = useRef(false);

  const playNewOrderSound = () => {
    const context = audioContextRef.current;
    if (!context || !soundEnabledRef.current || context.state === 'closed') return;
    const play = () => {
      const startAt = context.currentTime;
      [880, 660].forEach((frequency, index) => {
        const start = startAt + index * 0.18;
        const oscillator = context.createOscillator();
        const volume = context.createGain();
        oscillator.frequency.value = frequency;
        volume.gain.setValueAtTime(0.0001, start);
        volume.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
        volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        oscillator.connect(volume);
        volume.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.17);
      });
    };
    if (context.state === 'suspended') {
      context.resume().then(play).catch(() => setError('No se pudo reactivar el sonido. Volvé a activar las alertas sonoras.'));
    } else play();
  };

  const toggleSound = async () => {
    if (soundEnabledRef.current) {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      return;
    }
    try {
      if (!audioContextRef.current) {
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextConstructor) throw new Error('Este navegador no permite alertas sonoras.');
        audioContextRef.current = new AudioContextConstructor();
      }
      await audioContextRef.current.resume();
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      playNewOrderSound();
    } catch (soundError) {
      setError(soundError.message || 'No se pudieron activar las alertas sonoras.');
    }
  };

  const load = async (silent = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const [ordersResponse, configResponse] = await Promise.all([
        fetch('/api/orders'),
        silent ? Promise.resolve(null) : fetch('/api/delivery/config'),
      ]);
      const orderData = await ordersResponse.json().catch(() => null);
      if (!ordersResponse.ok) throw new Error(orderData?.message || 'No se pudieron cargar los pedidos.');
      let configData = null;
      if (configResponse) {
        configData = await configResponse.json().catch(() => null);
        if (!configResponse.ok) throw new Error(configData?.message || 'No se pudo cargar la zona de entrega.');
      }
      const nextOrders = Array.isArray(orderData) ? orderData : [];
      if (knownOrderIdsRef.current) {
        const newOrders = nextOrders.filter((order) => !knownOrderIdsRef.current.has(String(order._id)));
        if (newOrders.length) {
          const newestOrder = newOrders[0];
          setNewOrderAlert(newOrders.length === 1
            ? `Nuevo pedido: ${newestOrder.orderNumber} · ${newestOrder.customerName}.`
            : `Llegaron ${newOrders.length} pedidos nuevos. El más reciente: ${newestOrder.orderNumber} · ${newestOrder.customerName}.`);
          playNewOrderSound();
        }
      }
      knownOrderIdsRef.current = new Set(nextOrders.map((order) => String(order._id)));
      setOrders(nextOrders);
      if (configData) setConfig(configData);
    } catch (loadError) {
      setError(loadError.message || 'No se pudieron cargar los pedidos.');
    } finally {
      if (!silent) setLoading(false);
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 3000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleOrders = useMemo(() => orders.filter((order) => filter === 'all' || (
    filter === 'active' ? !['delivered', 'picked_up', 'cancelled'].includes(order.status) : order.status === filter
  )), [orders, filter]);

  const saveConfig = async (event) => {
    event.preventDefault();
    setSavingConfig(true);
    setError('');
    try {
      const response = await fetch('/api/delivery/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo guardar la zona de entrega.');
      setConfig(result);
      setCenterMarker(null);
      setNotice('Configuración de pedidos actualizada.');
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar la zona de entrega.');
    } finally {
      setSavingConfig(false);
    }
  };

  const updateStatus = async (order, status) => {
    if (status === 'cancelled' && !window.confirm(`¿Cancelar el pedido ${order.orderNumber}? Las unidades reservadas volverán al inventario.`)) return;
    setSavingOrderId(String(order._id));
    setError('');
    try {
      const response = await fetch(`/api/orders/${order._id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo actualizar el pedido.');
      setOrders((current) => current.map((item) => String(item._id) === String(result._id) ? result : item));
      setNotice(`Pedido ${result.orderNumber}: ${labels[result.status]}.`);
    } catch (updateError) {
      setError(updateError.message || 'No se pudo actualizar el pedido.');
    } finally {
      setSavingOrderId('');
    }
  };

  return <main className="orders-page">
    <header className="orders-page-heading"><div><span className="storefront-kicker">VENTAS ONLINE</span><h1>Pedidos</h1><p>Confirmá, prepará y coordiná las entregas o retiros.</p></div><div className="orders-heading-actions"><button type="button" className="orders-sound-toggle" onClick={toggleSound} aria-pressed={soundEnabled}>{soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}{soundEnabled ? 'Sonido activado' : 'Activar sonido'}</button><button type="button" className="orders-refresh" onClick={() => load()} disabled={loading}><RefreshCw size={16} />Actualizar</button></div></header>
    {newOrderAlert && <div className="orders-alert orders-new-order-alert" role="alert"><span>{newOrderAlert}</span><button type="button" onClick={() => setNewOrderAlert('')} aria-label="Cerrar alerta"><X size={15} /></button></div>}
    {error && <div className="orders-alert orders-alert-error" role="alert">{error}</div>}
    {notice && <div className="orders-alert" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Cerrar"><X size={15} /></button></div>}

    <section className="delivery-config-panel" aria-labelledby="delivery-config-heading">
      <div className="orders-section-heading"><div><h2 id="delivery-config-heading">Configuración de pedidos</h2><p>Definí la cobertura y el monto mínimo de compra. Hacé clic en el mapa para ajustar el punto del comercio.</p></div><span><Truck size={17} /> {config.radiusMeters} m</span></div>
      <form className="delivery-config-form" onSubmit={saveConfig}>
        <div className="delivery-config-fields">
          <label>Radio máximo (metros)<input type="number" min="100" max="50000" step="50" required value={config.radiusMeters} onChange={(event) => setConfig((current) => ({ ...current, radiusMeters: Number(event.target.value) }))} /></label>
          <label>Latitud del local<input type="number" min="-90" max="90" step="0.000001" required value={config.storeLatitude} onChange={(event) => setConfig((current) => ({ ...current, storeLatitude: Number(event.target.value) }))} /></label>
          <label>Longitud del local<input type="number" min="-180" max="180" step="0.000001" required value={config.storeLongitude} onChange={(event) => setConfig((current) => ({ ...current, storeLongitude: Number(event.target.value) }))} /></label>
          <label>Monto mínimo de compra ($)<input type="number" min="0" max="100000000" step="0.01" required value={config.minimumOrderAmount} onChange={(event) => setConfig((current) => ({ ...current, minimumOrderAmount: Number(event.target.value) }))} /></label>
          <button type="submit" className="orders-save-config" disabled={savingConfig}><Save size={16} />{savingConfig ? 'Guardando…' : 'Guardar configuración'}</button>
        </div>
        <small>El mínimo se calcula sobre los productos, antes del costo de envío. Ingresá 0 para desactivarlo.</small>
        <DeliveryMap
          center={{ latitude: config.storeLatitude, longitude: config.storeLongitude }}
          radius={Math.max(100, Number(config.radiusMeters) || 1000)}
          marker={centerMarker}
          onSelect={(point) => { setCenterMarker(point); setConfig((current) => ({ ...current, storeLatitude: Number(point.latitude.toFixed(6)), storeLongitude: Number(point.longitude.toFixed(6)) })); }}
          selectionLabel="Nuevo centro del local"
        />
      </form>
    </section>

    <section className="orders-list-section" aria-labelledby="orders-list-heading">
      <div className="orders-list-heading"><div><h2 id="orders-list-heading">Bandeja de pedidos</h2><p>{orders.filter((order) => !['delivered', 'picked_up', 'cancelled'].includes(order.status)).length} pendientes de completar</p></div><div className="orders-filter">
        <button type="button" className={filter === 'active' ? 'selected' : ''} onClick={() => setFilter('active')}>Activos</button>
        <button type="button" className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>Todos</button>
        <button type="button" className={filter === 'pending' ? 'selected' : ''} onClick={() => setFilter('pending')}>Nuevos</button>
      </div></div>
      {loading ? <div className="orders-empty"><Clock3 size={22} />Cargando pedidos…</div> : visibleOrders.length === 0 ? <div className="orders-empty"><PackageCheck size={26} /><strong>No hay pedidos en esta vista</strong><span>Cuando un cliente compre desde el catálogo aparecerá acá.</span></div> : <div className="orders-list">
        {visibleOrders.map((order) => <article className={`order-card order-status-${order.status}`} key={order._id}>
          <header className="order-card-header"><div><span className="order-number">{order.orderNumber}</span><span className={`order-status-pill ${order.status}`}>{labels[order.status] || order.status}</span></div><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString('es-AR')}</time></header>
          <div className="order-card-content">
            <section className="order-customer"><h3>{order.customerName}</h3><a href={`tel:${order.phone}`}>{order.phone}</a><a href={`mailto:${order.email}`}>{order.email}</a><p>{order.fulfillment === 'delivery' ? <><MapPin size={15} />{order.address || 'Dirección sin informar'}</> : <><Store size={15} />Retiro en el local</>}</p>{order.deliveryNote && <small>Indicaciones: {order.deliveryNote}</small>}{order.fulfillment === 'delivery' && Number.isFinite(order.latitude) && <a className="order-map-link" href={`https://www.openstreetmap.org/?mlat=${order.latitude}&mlon=${order.longitude}#map=17/${order.latitude}/${order.longitude}`} target="_blank" rel="noreferrer">Ver ubicación del cliente</a>}</section>
            <section className="order-items"><h4>Productos</h4>{order.items.map((item) => <div key={item.productId}><span>{item.quantity} × {item.name}</span><strong>{money(item.price * item.quantity)}</strong></div>)}<div className="order-total"><span>{order.fulfillment === 'delivery' ? 'Subtotal · envío a confirmar' : 'Total'}</span><strong>{money(order.total)}</strong></div><div className="order-payment-details"><span>Medio de pago</span><strong>{paymentMethodLabel(order)}</strong>{order.paymentType === 'cash' && Number.isFinite(Number(order.cashAmountTendered)) && <><span>Abona con</span><strong>{money(order.cashAmountTendered)}</strong><span>{order.fulfillment === 'delivery' ? 'Vuelto estimado sobre productos' : 'Vuelto estimado'}</span><strong>{money(Math.max(0, Number(order.cashAmountTendered) - Number(order.total)))}</strong></>}{order.paymentType === 'transfer' && <small>Coordinar datos y confirmar acreditación con el cliente.</small>}</div><small>{order.paymentType === 'transfer' ? 'Acordar con el cliente el momento del pago por transferencia.' : `Pago ${order.fulfillment === 'delivery' ? 'al recibir' : 'al retirar'}`}</small></section>
          </div>
          <footer className="order-card-actions">{!['cancelled', 'delivered', 'picked_up'].includes(order.status) && <label>Actualizar estado<select value="" disabled={savingOrderId === String(order._id)} onChange={(event) => { if (event.target.value) updateStatus(order, event.target.value); }}><option value="">Elegir acción…</option>{nextStates(order).map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select></label>}<a className="order-whatsapp" href={waLink(order)} target="_blank" rel="noreferrer"><MessageCircle size={16} />Abrir WhatsApp</a></footer>
        </article>)}
      </div>}
    </section>
  </main>;
}
