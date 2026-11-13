import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Banknote, CheckCircle2, Landmark, LocateFixed, LogIn, LogOut, MapPin, Minus, Package, Plus, Search, ShoppingBasket, Store, Tag, Trash2, Truck, UserRound, X } from 'lucide-react';
import DeliveryMap from './DeliveryMap.jsx';
import TurnstileWidget from './TurnstileWidget.jsx';
import { normalizeArgentinaMobile } from '../shared/phone.js';

const money = (amount) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(amount) || 0);
const moneyCents = (amount) => Math.round((Number(amount) || 0) * 100);
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();
const productImageKey = (product) => [product._id, product.imageUrl].join('|');
const defaultConfig = { storeLatitude: -26.866183, storeLongitude: -65.210705, radiusMeters: 1000, minimumOrderAmount: 10000 };
const emptyCustomer = { fullName: '', phone: '', email: '' };
const defaultSecurityConfig = { loading: true, required: true, enabled: false, siteKey: '' };
const orderStatusLabel = (status) => ({
  pending: 'Recibido', confirmed: 'Confirmado', preparing: 'Preparando', ready: 'Listo',
  out_for_delivery: 'En camino', delivered: 'Entregado', picked_up: 'Retirado', cancelled: 'Cancelado',
}[status] || status);

export default function OnlineCatalog() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [failedImages, setFailedImages] = useState(() => new Set());
  const [config, setConfig] = useState(defaultConfig);
  const [cart, setCart] = useState([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState('delivery');
  const [paymentType, setPaymentType] = useState('');
  const [cashAmountTendered, setCashAmountTendered] = useState('');
  const [customer, setCustomer] = useState(emptyCustomer);
  const [address, setAddress] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [location, setLocation] = useState(null);
  const [createAccount, setCreateAccount] = useState(false);
  const [password, setPassword] = useState('');
  const [accountEnabled, setAccountEnabled] = useState(false);
  const [signedInCustomer, setSignedInCustomer] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountMode, setAccountMode] = useState('login');
  const [registration, setRegistration] = useState(emptyCustomer);
  const [registrationPassword, setRegistrationPassword] = useState('');
  const [registrationError, setRegistrationError] = useState('');
  const [customerOrders, setCustomerOrders] = useState([]);
  const [securityConfig, setSecurityConfig] = useState(defaultSecurityConfig);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [loginError, setLoginError] = useState('');
  const captchaReady = !securityConfig.loading && (!securityConfig.required || securityConfig.enabled);
  const captchaPassed = captchaReady && (!securityConfig.required || Boolean(captchaToken));
  const resetCaptcha = () => {
    setCaptchaToken('');
    setCaptchaResetKey((current) => current + 1);
  };

  const loadProducts = async (signal, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const response = await fetch('/api/storefront/products', { signal });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'No se pudo cargar el catálogo.');
      setProducts(Array.isArray(data) ? data : []);
    } catch (loadError) {
      if (!silent && loadError.name !== 'AbortError') setError(loadError.message || 'No se pudo cargar el catálogo.');
    } finally {
      if (!silent && !signal?.aborted) setLoading(false);
    }
  };

  const loadCustomerStatus = async () => {
    const response = await fetch('/api/customer/status');
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || 'No se pudo comprobar la cuenta.');
    setAccountEnabled(data?.accountEnabled === true);
    if (data?.authenticated && data.customer) {
      const profile = data.customer;
      setSignedInCustomer(profile);
      setCustomer({ fullName: profile.fullName, phone: profile.phone, email: profile.email });
      setAddress(profile.address || '');
      setDeliveryNote(profile.deliveryNote || '');
      if (Number.isFinite(profile.latitude) && Number.isFinite(profile.longitude)) setLocation({ latitude: profile.latitude, longitude: profile.longitude });
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadProducts(controller.signal);
    const refreshTimer = window.setInterval(() => loadProducts(controller.signal, true), 5000);
    fetch('/api/delivery/config', { signal: controller.signal }).then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) setConfig({ ...defaultConfig, ...data }); })
      .catch(() => {});
    fetch('/api/security/config', { signal: controller.signal }).then(async (response) => {
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'No se pudo cargar la verificación de seguridad.');
      setSecurityConfig({
        loading: false,
        required: data?.turnstileRequired === true,
        enabled: data?.turnstileEnabled === true,
        siteKey: String(data?.turnstileSiteKey || ''),
      });
    }).catch((securityError) => {
      if (!controller.signal.aborted) setSecurityConfig({ ...defaultSecurityConfig, loading: false, error: securityError.message });
    });
    loadCustomerStatus().catch(() => {});
    const previousTitle = document.title;
    document.title = 'Catálogo online | Los Osman';
    return () => { controller.abort(); window.clearInterval(refreshTimer); document.title = previousTitle; };
  }, []);

  const categories = useMemo(() => ['Todos', ...new Set(products.map((product) => product.category).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')))], [products]);
  const shownProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'Todos' || product.category === category;
    const haystack = normalize([product.name, product.detail, product.category, product.barcode].join(' '));
    const matchesQuery = normalize(query).split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
    return matchesCategory && matchesQuery;
  }), [products, query, category]);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const minimumOrderMet = moneyCents(total) >= moneyCents(config.minimumOrderAmount);

  const addToCart = (product) => {
    setMessage('');
    const existing = cart.find((item) => String(item._id) === String(product._id));
    if (existing && Number.isInteger(product.stock) && existing.quantity >= product.stock) {
      setMessage(`No hay más unidades disponibles de ${product.name}.`);
      return;
    }
    if (existing) setCart((current) => current.map((item) => String(item._id) === String(product._id) ? { ...item, quantity: item.quantity + 1 } : item));
    else setCart((current) => [...current, { ...product, quantity: 1 }]);
  };

  const changeCartQuantity = (productId, delta) => {
    const item = cart.find((entry) => String(entry._id) === String(productId));
    if (item && Number.isInteger(item.stock) && item.quantity + delta > item.stock) {
      setMessage(`Solo quedan ${item.stock} unidades de ${item.name}.`);
      return;
    }
    setCart((current) => current.map((entry) => String(entry._id) === String(productId) ? { ...entry, quantity: entry.quantity + delta } : entry).filter((entry) => entry.quantity > 0));
  };

  const openCheckout = () => {
    setOrderSuccess(null);
    setMessage('');
    setPaymentType('');
    setCashAmountTendered('');
    resetCaptcha();
    setCheckoutOpen(true);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Este navegador no permite obtener la ubicación.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocating(false);
        setMessage('');
      },
      () => {
        setLocating(false);
        setMessage('No se pudo obtener tu ubicación. Tocá el punto correcto en el mapa.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submitOrder = async (event) => {
    event.preventDefault();
    setMessage('');
    if (!paymentType) {
      setMessage('Elegí efectivo o transferencia.');
      return;
    }
    if (!minimumOrderMet) {
      setMessage(`El monto mínimo de compra es ${money(config.minimumOrderAmount)} en productos.`);
      return;
    }
    if (paymentType === 'cash' && (cashAmountTendered === '' || !Number.isFinite(Number(cashAmountTendered)) || Math.round(Number(cashAmountTendered) * 100) < Math.round(total * 100))) {
      setMessage('El importe en efectivo debe cubrir al menos el subtotal del pedido.');
      return;
    }
    if (!captchaReady) {
      setMessage(securityConfig.loading ? 'Cargando la verificación de seguridad…' : 'La verificación anti-bots no está configurada. Contactá al comercio.');
      return;
    }
    if (!captchaPassed) {
      setMessage('Completá la verificación anti-bots para continuar.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillment, paymentType, cashAmountTendered: paymentType === 'cash' ? Number(cashAmountTendered) : null,
          customer: { ...customer, phone: normalizeArgentinaMobile(customer.phone) }, address, latitude: location?.latitude, longitude: location?.longitude,
          deliveryNote, items: cart.map((item) => ({ productId: item._id, quantity: item.quantity })),
          createAccount: createAccount && !signedInCustomer, password, captchaToken,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo enviar el pedido.');
      setOrderSuccess(result.order);
      setCart([]);
      setPassword('');
      setCreateAccount(false);
      if (result.accountCreated) {
        const status = await fetch('/api/customer/status').then((r) => r.json());
        if (status?.authenticated) setSignedInCustomer(status.customer);
      }
      await loadProducts();
    } catch (submitError) {
      setMessage(submitError.message || 'No se pudo enviar el pedido.');
    } finally {
      resetCaptcha();
      setBusy(false);
    }
  };

  const loginCustomer = async (event) => {
    event.preventDefault();
    setLoginError('');
    if (!captchaReady) {
      setLoginError(securityConfig.loading ? 'Cargando la verificación de seguridad…' : 'La verificación anti-bots no está configurada. Contactá al comercio.');
      return;
    }
    if (!captchaPassed) {
      setLoginError('Completá la verificación anti-bots para continuar.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/customer/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: accountEmail, password: accountPassword, captchaToken }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo iniciar sesión.');
      const profile = result.customer;
      setSignedInCustomer(profile);
      setCustomer({ fullName: profile.fullName, phone: profile.phone, email: profile.email });
      setAddress(profile.address || '');
      setDeliveryNote(profile.deliveryNote || '');
      if (Number.isFinite(profile.latitude) && Number.isFinite(profile.longitude)) setLocation({ latitude: profile.latitude, longitude: profile.longitude });
      const ordersResponse = await fetch('/api/customer/orders');
      setCustomerOrders(ordersResponse.ok ? await ordersResponse.json() : []);
      setAccountPassword('');
    } catch (loginSubmitError) {
      setLoginError(loginSubmitError.message || 'No se pudo iniciar sesión.');
    } finally {
      resetCaptcha();
      setBusy(false);
    }
  };

  const registerCustomer = async (event) => {
    event.preventDefault();
    setRegistrationError('');
    if (!captchaReady) {
      setRegistrationError(securityConfig.loading ? 'Cargando la verificación de seguridad…' : 'La verificación anti-bots no está configurada. Contactá al comercio.');
      return;
    }
    if (!captchaPassed) {
      setRegistrationError('Completá la verificación anti-bots para continuar.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/customer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: registration.fullName,
          phone: normalizeArgentinaMobile(registration.phone),
          email: registration.email,
          password: registrationPassword,
          captchaToken,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo crear la cuenta.');
      setSignedInCustomer(result.customer);
      setCustomer({ fullName: result.customer.fullName, phone: result.customer.phone, email: result.customer.email });
      setRegistrationPassword('');
      setCustomerOrders([]);
    } catch (registerError) {
      setRegistrationError(registerError.message || 'No se pudo crear la cuenta.');
    } finally {
      resetCaptcha();
      setBusy(false);
    }
  };

  const logoutCustomer = async () => {
    await fetch('/api/customer/logout', { method: 'POST' });
    setSignedInCustomer(null);
    setCustomer(emptyCustomer);
    setAddress('');
    setDeliveryNote('');
    setLocation(null);
    setCustomerOrders([]);
    setAccountOpen(false);
  };

  return <div className="storefront-page">
    <header className="storefront-header">
      <a className="storefront-brand" href="/" aria-label="Los Osman, catálogo online"><span><Store size={23} /></span><div><strong>LOS OSMAN</strong><small>Catálogo y pedidos online</small></div></a>
      <div className="storefront-header-actions">
        <button className="storefront-account-button" type="button" onClick={() => { setAccountOpen(true); setAccountMode('login'); setLoginError(''); setRegistrationError(''); resetCaptcha(); if (signedInCustomer) fetch('/api/customer/orders').then((r) => r.ok ? r.json() : []).then(setCustomerOrders).catch(() => setCustomerOrders([])); }}><UserRound size={16} />{signedInCustomer ? signedInCustomer.fullName.split(' ')[0] : 'Mi cuenta'}</button>
        <a className="storefront-staff-link" href="/login">Ingresar al sistema <ArrowRight size={16} /></a>
      </div>
    </header>
    <main className="storefront-main">
      <section className="storefront-hero"><div className="storefront-hero-copy"><span className="storefront-kicker"><i /> CATÁLOGO ONLINE</span><h1>Encontrá tus productos<br /><em>de todos los días.</em></h1><p>Explorá el catálogo y consultá los precios vigentes de Los Osman.</p><a className="storefront-hero-link" href="#productos">Ver productos <ArrowRight size={17} /></a></div><div className="storefront-hero-art" aria-hidden="true"><div className="storefront-art-circle storefront-art-circle-one"/><div className="storefront-art-circle storefront-art-circle-two"/><div className="storefront-bag"><Store size={58} strokeWidth={1.4} /></div><span className="storefront-art-tag"><Tag size={17} /> Precios actualizados</span></div></section>
      <section className="storefront-products" id="productos">
        <div className="storefront-section-heading"><div><span className="storefront-kicker">LOS OSMAN · SELECCIÓN</span><h2>Productos disponibles</h2><p>{config.minimumOrderAmount > 0 ? `Encontrá lo que necesitás. Pedido mínimo: ${money(config.minimumOrderAmount)} en productos.` : 'Encontrá lo que necesitás de forma rápida.'}</p></div><span className="storefront-product-count">{loading ? 'Cargando…' : `${shownProducts.length} productos`}</span></div>
        <div className="storefront-toolbar"><label className="storefront-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto o categoría" aria-label="Buscar productos" /></label><div className="storefront-categories" aria-label="Filtrar por categoría">{categories.map((item) => <button type="button" key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
        {error && <div className="storefront-message storefront-error"><p>{error}</p><button type="button" onClick={() => loadProducts()}>Volver a intentar</button></div>}
        {loading && <div className="storefront-loading"><span /> Cargando catálogo…</div>}
        {!loading && !error && <div className="storefront-grid">{shownProducts.map((product) => <article className="storefront-card" key={product._id}><div className="storefront-card-art"><span className="storefront-card-category">{product.category || 'Otros'}</span>{product.imageUrl && !failedImages.has(productImageKey(product)) ? <img className="storefront-product-photo" src={product.imageUrl} alt={product.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImages((current) => new Set(current).add(productImageKey(product)))} /> : <div className="storefront-product-icon"><Package size={34} strokeWidth={1.5} /></div>}<span className="storefront-stock"><i />{Number.isInteger(product.stock) ? `${product.stock} disponibles` : 'Disponible'}</span></div><div className="storefront-card-body"><h3>{product.name}</h3>{product.detail && <p>{product.detail}</p>}<div className="storefront-card-bottom"><strong>{money(product.price)}</strong><button className="storefront-add-button" type="button" onClick={() => addToCart(product)} aria-label={`Agregar ${product.name}`}><Plus size={18} /> Agregar</button></div></div></article>)}{!shownProducts.length && <div className="storefront-empty"><div><Search size={23} /></div><strong>No encontramos productos</strong><span>Probá con otra búsqueda o categoría.</span><button type="button" onClick={() => { setQuery(''); setCategory('Todos'); }}>Limpiar filtros</button></div>}</div>}
      </section>
      {message && !checkoutOpen && <div className="storefront-message storefront-error"><p>{message}</p></div>}
      {itemCount > 0 && <button className="storefront-cart-bar" type="button" onClick={openCheckout}><ShoppingBasket size={19} /><span>{itemCount} productos · {money(total)}</span><strong>Ver carrito</strong></button>}
      <footer className="storefront-footer"><span className="storefront-footer-mark"><Store size={18} /></span><span><strong>LOS OSMAN</strong><small>Precios sujetos a actualización.</small></span><a href="#productos">Volver al catálogo ↑</a></footer>
    </main>

    {checkoutOpen && <div className="storefront-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCheckoutOpen(false); }}>
      <section className="storefront-checkout" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <div className="storefront-checkout-heading"><div><span className="storefront-kicker">TU PEDIDO</span><h2 id="checkout-title">{orderSuccess ? 'Pedido recibido' : 'Finalizar pedido'}</h2></div><button type="button" className="storefront-icon-button" onClick={() => setCheckoutOpen(false)} aria-label="Cerrar"><X size={20} /></button></div>
        {orderSuccess ? <div className="order-success"><CheckCircle2 size={42} /><strong>¡Gracias! Recibimos tu pedido.</strong><p>Pedido <b>{orderSuccess.orderNumber}</b> · Estado: {orderStatusLabel(orderSuccess.status)}.</p><p>{orderSuccess.paymentType === 'transfer' ? 'El local te contactará para coordinar la transferencia y confirmar los datos de pago.' : `Pago en efectivo: ${money(orderSuccess.cashAmountTendered)}.`}{orderSuccess.fulfillment === 'delivery' ? ' El envío y su costo se confirmarán por WhatsApp.' : ' Te avisaremos cuando esté listo para retirar.'}</p><button type="button" onClick={() => { setOrderSuccess(null); setCheckoutOpen(false); }}>Seguir comprando</button></div> : <form className="storefront-checkout-body" onSubmit={submitOrder}>
          <div className="storefront-fulfillment"><button type="button" className={fulfillment === 'delivery' ? 'selected' : ''} onClick={() => setFulfillment('delivery')}><Truck size={18} /> Envío</button><button type="button" className={fulfillment === 'pickup' ? 'selected' : ''} onClick={() => setFulfillment('pickup')}><Store size={18} /> Retiro</button></div>
          <div className="storefront-order-items">{cart.map((item) => <div className="storefront-order-item" key={item._id}><div><strong>{item.name}</strong><small>{money(item.price)} c/u</small></div><div className="storefront-quantity"><button type="button" onClick={() => changeCartQuantity(item._id, -1)} aria-label={`Restar ${item.name}`}><Minus size={14} /></button><span>{item.quantity}</span><button type="button" onClick={() => changeCartQuantity(item._id, 1)} aria-label={`Sumar ${item.name}`}><Plus size={14} /></button><button type="button" onClick={() => setCart((current) => current.filter((entry) => entry._id !== item._id))} aria-label={`Quitar ${item.name}`}><Trash2 size={14} /></button></div></div>)}<div className="storefront-order-total"><span>Total de productos</span><strong>{money(total)}</strong></div></div>
          {config.minimumOrderAmount > 0 && <p className={`storefront-minimum-order ${minimumOrderMet ? '' : 'not-met'}`}>Pedido mínimo: {money(config.minimumOrderAmount)} en productos; el costo de envío no está incluido.</p>}
          {!minimumOrderMet && <p className="storefront-minimum-order-warning" role="status">Agregá {money(config.minimumOrderAmount - total)} más para alcanzar el mínimo.</p>}
          <section className="storefront-payment-methods" aria-labelledby="payment-method-heading">
            <div><h3 id="payment-method-heading">¿Cómo vas a pagar?</h3><p>Elegí efectivo o transferencia para este pedido.</p></div>
            <div className="storefront-payment-options" role="radiogroup" aria-labelledby="payment-method-heading">
              <label className={`storefront-payment-option ${paymentType === 'cash' ? 'selected' : ''}`}><input required type="radio" name="paymentType" value="cash" checked={paymentType === 'cash'} onChange={() => { setPaymentType('cash'); setCashAmountTendered(''); }} /><Banknote size={18} /><span>Efectivo</span></label>
              <label className={`storefront-payment-option ${paymentType === 'transfer' ? 'selected' : ''}`}><input required type="radio" name="paymentType" value="transfer" checked={paymentType === 'transfer'} onChange={() => { setPaymentType('transfer'); setCashAmountTendered(''); }} /><Landmark size={18} /><span>Transferencia</span></label>
            </div>
            {paymentType === 'cash' && <label className="storefront-cash-amount">¿Con cuánto vas a abonar?
              <span className="storefront-cash-input"><span>$</span><input required type="number" min={total} max="100000000" step="0.01" inputMode="decimal" value={cashAmountTendered} onChange={(event) => setCashAmountTendered(event.target.value)} placeholder={String(total)} /></span>
              <small>{fulfillment === 'delivery' ? 'Ingresá al menos el subtotal. El envío se confirma por WhatsApp.' : 'Ingresá el importe que vas a entregar en el local.'}</small>
              {Number(cashAmountTendered) >= total && <span className="storefront-cash-change">Vuelto {fulfillment === 'delivery' ? 'estimado sobre productos' : 'estimado'}: <strong>{money(Math.max(0, Number(cashAmountTendered) - total))}</strong></span>}
            </label>}
            {paymentType === 'transfer' && <p className="storefront-transfer-note">El local te contactará para compartir los datos de transferencia y confirmar el pago.</p>}
          </section>
          {securityConfig.loading && <p className="storefront-security-note" role="status">Cargando la verificación de seguridad…</p>}
          {!securityConfig.loading && securityConfig.required && securityConfig.enabled && <TurnstileWidget siteKey={securityConfig.siteKey} action="online_order" resetKey={captchaResetKey} onToken={setCaptchaToken} />}
          {!securityConfig.loading && securityConfig.required && !securityConfig.enabled && <p className="storefront-security-note error" role="alert">{securityConfig.error || 'La verificación anti-bots no está configurada. Contactá al comercio.'}</p>}
          <div className="storefront-contact-fields"><h3>Datos de contacto</h3><label>Nombre y apellido<input required maxLength="120" autoComplete="name" value={customer.fullName} onChange={(event) => setCustomer((current) => ({ ...current, fullName: event.target.value }))} /></label><label>Celular / WhatsApp<input required type="tel" maxLength="24" autoComplete="tel" placeholder="3816436214" value={customer.phone} onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} onBlur={() => setCustomer((current) => { const phone = normalizeArgentinaMobile(current.phone); return phone.length === 10 ? { ...current, phone } : current; })} /><small>Ingresalo sin 0 ni 15, por ejemplo: 3816436214.</small></label><label>Correo electrónico<input required type="email" maxLength="254" autoComplete="email" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} /></label></div>
          {fulfillment === 'delivery' && <div className="storefront-location-fields"><div className="storefront-form-heading"><div><h3>Dirección de entrega</h3><p>Estamos dentro de un radio de {config.radiusMeters} m del local.</p></div><button type="button" onClick={useCurrentLocation} disabled={locating}><LocateFixed size={16} />{locating ? 'Ubicando…' : 'Usar mi ubicación'}</button></div><label>Dirección, calle y altura<input required maxLength="240" autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Calle, altura, piso/departamento" /></label><label>Indicaciones para llegar<textarea maxLength="500" rows="2" value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} placeholder="Entre calles, referencia, timbre…" /></label><p className="storefront-map-hint"><MapPin size={15} />Tocá el mapa para marcar el punto exacto de entrega.</p><DeliveryMap center={{ latitude: config.storeLatitude, longitude: config.storeLongitude }} radius={config.radiusMeters} marker={location} onSelect={setLocation} /><div className={`storefront-location-status ${location ? 'has-location' : ''}`}>{location ? `Ubicación seleccionada: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : 'Falta marcar tu ubicación en el mapa.'}</div></div>}
          {accountEnabled && !signedInCustomer && <label className="storefront-create-account"><input type="checkbox" checked={createAccount} onChange={(event) => setCreateAccount(event.target.checked)} /><span><strong>Crear una cuenta</strong><small>Guardá tus datos para hacer futuros pedidos más rápido.</small></span></label>}
          {createAccount && !signedInCustomer && <label className="storefront-password-field">Contraseña (mínimo 12 caracteres)<input required type="password" minLength="12" maxLength="200" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
          {signedInCustomer && <div className="storefront-signed-in">Pedido para la cuenta de {signedInCustomer.fullName}.</div>}
          {message && <div className="storefront-message storefront-error"><p>{message}</p></div>}
          {fulfillment === 'delivery' && <div className="storefront-payment-note">El costo del envío se confirma al gestionar el pedido y se suma al subtotal de productos.</div>}
          <button type="submit" className="storefront-submit-order" disabled={busy || !cart.length || !paymentType || !minimumOrderMet || !captchaReady || !captchaPassed || (paymentType === 'cash' && (!cashAmountTendered || !Number.isFinite(Number(cashAmountTendered)) || Math.round(Number(cashAmountTendered) * 100) < Math.round(total * 100))) || (fulfillment === 'delivery' && !location)}>{busy ? 'Enviando pedido…' : !minimumOrderMet ? `Pedido mínimo · ${money(config.minimumOrderAmount)}` : `Enviar pedido · ${money(total)}`}</button>
        </form>}
      </section>
    </div>}

    {accountOpen && <div className="storefront-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setAccountOpen(false); }}>
      <section className="storefront-account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="storefront-checkout-heading"><div><span className="storefront-kicker">CLIENTES</span><h2 id="account-title">{signedInCustomer ? 'Mi cuenta' : accountEnabled && accountMode === 'register' ? 'Registrarse' : 'Mi cuenta'}</h2></div><button type="button" className="storefront-icon-button" onClick={() => setAccountOpen(false)} aria-label="Cerrar"><X size={20} /></button></div>
        {signedInCustomer ? <div className="storefront-account-body"><strong>{signedInCustomer.fullName}</strong><span>{signedInCustomer.email}</span><h3>Mis últimos pedidos</h3>{customerOrders.length ? customerOrders.map((order) => <div className="storefront-history-order" key={order._id}><strong>{order.orderNumber} · {orderStatusLabel(order.status)}</strong><span>{new Date(order.createdAt).toLocaleDateString('es-AR')} · {money(order.total)}</span></div>) : <p>Todavía no tenés pedidos en esta cuenta.</p>}<button className="storefront-logout-button" type="button" onClick={logoutCustomer}><LogOut size={16} /> Cerrar sesión</button></div>
          : accountEnabled ? accountMode === 'register' ? <form className="storefront-account-body" onSubmit={registerCustomer}>
            <div className="storefront-account-info"><strong>Registrarse es opcional</strong><p>También podés comprar como invitado. Con una cuenta guardás tus datos y consultás tus pedidos anteriores.</p></div>
            <label>Nombre y apellido<input required maxLength="120" autoComplete="name" value={registration.fullName} onChange={(event) => setRegistration((current) => ({ ...current, fullName: event.target.value }))} /></label>
            <label>Celular / WhatsApp<input required type="tel" maxLength="24" autoComplete="tel" placeholder="3816436214" value={registration.phone} onChange={(event) => setRegistration((current) => ({ ...current, phone: event.target.value }))} /><small>Ingresalo sin 0 ni 15.</small></label>
            <label>Correo electrónico<input required type="email" maxLength="254" autoComplete="email" value={registration.email} onChange={(event) => setRegistration((current) => ({ ...current, email: event.target.value }))} /></label>
            <label>Contraseña (mínimo 12 caracteres)<input required type="password" minLength="12" maxLength="200" autoComplete="new-password" value={registrationPassword} onChange={(event) => setRegistrationPassword(event.target.value)} /></label>
            {securityConfig.loading && <p className="storefront-security-note" role="status">Cargando la verificación de seguridad…</p>}
            {!securityConfig.loading && securityConfig.required && securityConfig.enabled && <TurnstileWidget siteKey={securityConfig.siteKey} action="customer_register" resetKey={captchaResetKey} onToken={setCaptchaToken} />}
            {!securityConfig.loading && securityConfig.required && !securityConfig.enabled && <p className="storefront-security-note error" role="alert">{securityConfig.error || 'La verificación anti-bots no está configurada.'}</p>}
            {registrationError && <div className="storefront-message storefront-error"><p>{registrationError}</p></div>}
            <button className="storefront-submit-order" type="submit" disabled={busy || !captchaReady || !captchaPassed}>{busy ? 'Creando cuenta…' : 'Registrarse'}</button>
            <button className="storefront-account-switch" type="button" onClick={() => { setAccountMode('login'); setRegistrationError(''); resetCaptcha(); }}>Ya tengo cuenta · Iniciar sesión</button>
          </form> : <form className="storefront-account-body" onSubmit={loginCustomer}>
            <div className="storefront-account-info"><strong>No hace falta registrarse para comprar</strong><p>Podés comprar como invitado. Si creás una cuenta, guardás tus datos y consultás tus pedidos anteriores.</p></div>
            <p>Ingresá para recuperar tus datos y ver el estado de tus pedidos.</p>
            <label>Correo electrónico<input required type="email" autoComplete="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} /></label>
            <label>Contraseña<input required type="password" autoComplete="current-password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} /></label>
            {securityConfig.loading && <p className="storefront-security-note" role="status">Cargando la verificación de seguridad…</p>}
            {!securityConfig.loading && securityConfig.required && securityConfig.enabled && <TurnstileWidget siteKey={securityConfig.siteKey} action="customer_login" resetKey={captchaResetKey} onToken={setCaptchaToken} />}
            {!securityConfig.loading && securityConfig.required && !securityConfig.enabled && <p className="storefront-security-note error" role="alert">{securityConfig.error || 'La verificación anti-bots no está configurada.'}</p>}
            {loginError && <div className="storefront-message storefront-error"><p>{loginError}</p></div>}
            <button className="storefront-submit-order" type="submit" disabled={busy || !captchaReady || !captchaPassed}><LogIn size={17} />{busy ? 'Ingresando…' : 'Iniciar sesión'}</button>
            <button className="storefront-account-switch" type="button" onClick={() => { setAccountMode('register'); setRegistrationError(''); setRegistration(emptyCustomer); resetCaptcha(); }}>Registrarse</button>
          </form> : <div className="storefront-account-body">
            <div className="storefront-account-info"><strong>No necesitás registrarte para comprar</strong><p>Podés hacer tu pedido como invitado. El registro y el historial de pedidos se habilitan cuando el comercio activa las cuentas de clientes.</p></div>
            <button className="storefront-account-switch" type="button" disabled>Registrarse</button>
            <button className="storefront-submit-order" type="button" onClick={() => setAccountOpen(false)}>Seguir comprando</button>
          </div>}
      </section>
    </div>}
  </div>;
}
