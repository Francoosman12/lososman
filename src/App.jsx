import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck, Barcode, Banknote, Camera, Check, ChevronDown, CircleHelp, CreditCard,
  ImagePlus, Menu, Minus, PackagePlus, Pencil, Plus, QrCode, Search, ShoppingBasket, Store, Tag, Trash2, X, UsersRound, ClipboardList, LogOut, Globe2,
} from 'lucide-react';

import Labels from './Labels.jsx';
import Combos from './Combos.jsx';
import Reports from './Reports.jsx';
import Users from './Users.jsx';
import Inventory from './Inventory.jsx';
import Orders from './Orders.jsx';
import Customers from './Customers.jsx';

const demoProducts = [
  { _id: 'p1', name: 'Coca-Cola 2.25 L', detail: 'Botella grande', barcode: '7790895000993', price: 3400, category: 'Bebidas' },
  { _id: 'p2', name: 'Yerba Playadito 1 kg', detail: 'Paquete amarillo', barcode: '7793704000018', price: 4200, category: 'Almacén' },
  { _id: 'p3', name: 'Alfajor Havanna', detail: 'Mar del Plata', barcode: '7798123200124', price: 1800, category: 'Golosinas' },
  { _id: 'p4', name: 'Galletitas Chocolinas', detail: 'Paquete de 250 gramos', barcode: '7622300852804', price: 1650, category: 'Galletitas' },
  { _id: 'p5', name: 'Agua Mineral 1.5 L', detail: 'Sin gas', barcode: '7798062540103', price: 1450, category: 'Bebidas' },
  { _id: 'p6', name: 'Don Satur Grasa', detail: 'Bizcochitos clásicos', barcode: '7790040990010', price: 1100, category: 'Galletitas' },
  { _id: 'p7', name: 'Queso Cremoso', detail: 'Trozado La Paulina', barcode: '2000000000007', price: 2900, category: 'Fiambres' },
  { _id: 'p8', name: 'Leche Entera 1 L', detail: 'Sachet La Serenísima', barcode: '7790742301203', price: 1350, category: 'Lácteos' },
  { _id: 'p9', name: 'Papas Lays Clásicas', detail: 'Bolsa mediana', barcode: '7790310000015', price: 2300, category: 'Snacks' },
];

const suggestedPrice = (cost, margin, roundTo = 1) => { const target = Number(margin); const amount = Number(cost); const increment = Math.max(1, Number(roundTo) || 1); if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(target) || target < 0 || target >= 1) return null; return Math.ceil((amount / (1 - target)) / increment) * increment; };

const money = (amount) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(amount || 0);

const normalizeSearchText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();
const matchesSearch = (query, ...values) => { const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean); const text = normalizeSearchText(values.filter(Boolean).join(' ')); return terms.every((term) => text.includes(term)); };

const businessCategories = ['Almacén', 'Bebidas', 'Lácteos', 'Fiambres', 'Panadería', 'Verdulería', 'Carnicería', 'Limpieza', 'Higiene personal', 'Golosinas', 'Snacks', 'Congelados', 'Mascotas', 'Otros'];

const preloadCameraDecoder = () => { import('@zxing/browser').catch(() => {}); };

function CameraScanner({ onScan, onClose, closeAfterScan = false }) {
  const videoRef = useRef(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const scanLockRef = useRef({ code: '', timer: null });
  const controlsRef = useRef(null);
  const [status, setStatus] = useState('Iniciando cámara…');
  const [error, setError] = useState('');
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  useEffect(() => {
    let cancelled = false;
    import('@zxing/browser').then(({ BarcodeFormat, BrowserMultiFormatOneDReader }) => {
      if (cancelled) return null;
      const reader = new BrowserMultiFormatOneDReader(undefined, { delayBetweenScanAttempts: 65, delayBetweenScanSuccess: 0, tryPlayVideoTimeout: 8000 });
      reader.possibleFormats = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR];
      return reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } }, videoRef.current, (result, _decodeError, controls) => {
        if (cancelled) return;
        if (!controlsRef.current) {
          controlsRef.current = controls;
          const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
          setTorchAvailable(Boolean(track && 'torch' in (track.getCapabilities?.() || {})));
          setStatus('Cámara lista · enfocá el código dentro del marco');
        }
        if (!result) return;
        const code = result.getText().trim();
        if (!code) return;
        window.clearTimeout(scanLockRef.current.timer);
        if (scanLockRef.current.code !== code) {
          scanLockRef.current.code = code;
          const message = onScanRef.current(code);
          setStatus(message || `Código ${code}: producto no encontrado`);
          if (message && closeAfterScan) window.setTimeout(() => { if (!cancelled) onCloseRef.current(); }, 100);
        }
        scanLockRef.current.timer = window.setTimeout(() => { scanLockRef.current.code = ''; }, 900);
      });
    }).then((controls) => {
      if (!controls) return;
      if (cancelled) controls.stop();
      else controlsRef.current = controls;
    }).catch((cameraError) => {
      if (cancelled) return;
      const messages = {
        NotAllowedError: 'Permití el acceso a la cámara en el navegador y volvé a intentar.',
        NotFoundError: 'No encontramos una cámara disponible en este dispositivo.',
        NotReadableError: 'La cámara está siendo usada por otra aplicación.',
        OverconstrainedError: 'No se pudo iniciar la cámara trasera. Probá con otra cámara.',
      };
      setError(messages[cameraError?.name] || 'No se pudo iniciar la cámara. Verificá los permisos e intentá otra vez.');
      setStatus('Cámara no disponible');
    });
    return () => {
      cancelled = true;
      window.clearTimeout(scanLockRef.current.timer);
      controlsRef.current?.stop();
    };
  }, []);

  const toggleTorch = async () => {
    if (!controlsRef.current?.switchTorch) return;
    try { await controlsRef.current.switchTorch(!torch); setTorch(!torch); }
    catch { setError('La linterna no está disponible en esta cámara.'); }
  };

  return (
    <div className="modal-backdrop camera-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="camera-modal" role="dialog" aria-modal="true" aria-labelledby="camera-title">
        <div className="modal-heading"><div><h2 id="camera-title">Escanear con cámara</h2><p>Usá la cámara trasera y acercá el código al marco.</p></div><button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar cámara"><X size={20} /></button></div>
        <div className="camera-preview"><video ref={videoRef} muted playsInline aria-label="Vista previa de la cámara" />{!error && <div className="camera-target" aria-hidden="true"><i /></div>}{error && <div className="camera-error"><Camera size={25} /><span>{error}</span><small>La cámara requiere permiso del navegador y una conexión segura (HTTPS o localhost).</small></div>}</div>
        <div className={`camera-status ${error ? 'camera-status-error' : ''}`} role="status"><span />{error || status}</div>
        <div className="camera-actions">{torchAvailable && <button type="button" className="camera-torch" onClick={toggleTorch}>{torch ? 'Apagar linterna' : 'Encender linterna'}</button>}<button type="button" className="camera-done" onClick={onClose}>Listo</button></div>
      </section>
    </div>
  );
}

export default function App() {
  const scannerRef = useRef(null);
  const productBarcodeRef = useRef(null);
  const productFormRef = useRef(null);
  const productNameRef = useRef(null);
  const productCatalogSearchRef = useRef(null);
  const [products, setProducts] = useState(demoProducts);
  const [connected, setConnected] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [cart, setCart] = useState([]);
  const [toast, setToast] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [stockWarningOpen, setStockWarningOpen] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [paid, setPaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [combosOpen, setCombosOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [combos, setCombos] = useState([]);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [stockReceiptProduct, setStockReceiptProduct] = useState(null);
  const [stockReceiptQuantity, setStockReceiptQuantity] = useState('');
  const [stockReceiptReason, setStockReceiptReason] = useState('');
  const [stockMovementType, setStockMovementType] = useState('purchase');
  const [inventoryMovements, setInventoryMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [valueHistory, setValueHistory] = useState([]);
  const [loadingValueHistory, setLoadingValueHistory] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [productAdminTab, setProductAdminTab] = useState('catalog');
  const [productCatalogQuery, setProductCatalogQuery] = useState('');
  const [productCatalogCategory, setProductCatalogCategory] = useState('Todas');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState('sale');
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [recentProductId, setRecentProductId] = useState('');
  const productCardRefs = useRef(new Map());
  const [productForm, setProductForm] = useState({ name: '', barcode: '', sku: '', supplier: '', detail: '', price: '', cost: '', additionalCost: '', stock: '0', minStock: '5', targetMargin: '35', priceRoundTo: '50', publishedOnline: false, valueChangeReason: '', category: 'Otros', stockReason: '' });
  const [editingProduct, setEditingProduct] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingProductImage, setUploadingProductImage] = useState(false);
  const [publicationSavingId, setPublicationSavingId] = useState('');
  const [pendingBarcode, setPendingBarcode] = useState('');
  const can = (permission) => Boolean(currentUser?.permissions?.includes(permission));
  const closeAdminSections = () => { setProductsOpen(false); setLabelsOpen(false); setCombosOpen(false); setReportsOpen(false); setUsersOpen(false); setInventoryOpen(false); setOrdersOpen(false); setCustomersOpen(false); };
  const categories = useMemo(() => ['Todos', ...new Set([...businessCategories, ...products.map((product) => product.category).filter(Boolean), ...(combos.length ? ['Promociones'] : [])])], [products, combos.length]);

  const total = useMemo(() => cart.reduce((sum, row) => sum + row.price * row.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, row) => sum + row.quantity, 0), [cart]);
  const normalizedQuery = normalizeSearchText(query);
  const comboProducts = useMemo(() => combos.filter((combo) => combo.active && combo.valid !== false).map((combo) => ({ _id: 'combo:' + combo._id, comboId: String(combo._id), kind: 'combo', name: combo.name, detail: combo.description || combo.components.map((component) => component.quantity + ' × ' + component.name).join(' · '), barcode: '', price: combo.price, stock: combo.availableQuantity, minStock: 0, category: 'Promociones' })), [combos]);
  const sellableProducts = useMemo(() => [...products, ...comboProducts], [products, comboProducts]);
  const visibleProducts = useMemo(() => sellableProducts.filter((product) => {
    const matchCategory = category === 'Todos' || product.category === category;
    const matchQuery = !normalizedQuery || matchesSearch(normalizedQuery, product.name, product.barcode, product.detail, product.category);
    return matchCategory && matchQuery;
  }), [sellableProducts, category, normalizedQuery]);
  const filteredAdminProducts = useMemo(() => {
    const search = normalizeSearchText(productCatalogQuery);
    return products.filter((product) => {
      const matchesProduct = !search || matchesSearch(search, product.name, product.barcode, product.detail, product.category);
      return matchesProduct && (productCatalogCategory === 'Todas' || product.category === productCatalogCategory);
    }).sort((a, b) => a.name.localeCompare(b.name, 'es-AR'));
  }, [products, productCatalogQuery, productCatalogCategory]);
  const trackedProducts = products.filter((product) => Number.isInteger(product.stock));
  const stockUnitCount = trackedProducts.reduce((total, product) => total + Math.max(0, product.stock), 0);
  const lowStockCount = trackedProducts.filter((product) => product.stock >= 0 && product.stock <= (product.minStock ?? 5)).length;
  const untrackedStockCount = products.length - trackedProducts.length;
  const stockDeficitCount = trackedProducts.reduce((total, product) => total + Math.max(0, -product.stock), 0);
  const stockShortages = useMemo(() => cart.flatMap((item) => {
    const product = item.comboId ? comboProducts.find((entry) => entry.comboId === String(item.comboId)) : products.find((entry) => String(entry._id) === String(item.productId));
    if (!Number.isInteger(product?.stock) || item.quantity <= product.stock) return [];
    return [{ name: item.name, available: product.stock, quantity: item.quantity, deficit: item.quantity - product.stock }];
  }), [cart, products, comboProducts]);

  useEffect(() => {
    if (!cart.length) setCartOpen(false);
  }, [cart.length]);

  useEffect(() => {
    if (!productsOpen) return undefined;
    const frame = window.requestAnimationFrame(() => {
      if (productAdminTab === 'catalog') productCatalogSearchRef.current?.focus({ preventScroll: true });
      else if (!editingProduct) productNameRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [productsOpen, productAdminTab, editingProduct]);

  const openAdminPage = (destination, userOverride = currentUser) => {
    const user = userOverride;
    if (!user) {
      window.location.replace('/login');
      return;
    }
    const permissionByPage = { products: 'products.manage', labels: 'labels.manage', combos: 'combos.manage', reports: 'reports.view', users: 'users.manage', inventory: 'inventory.manage', orders: 'orders.manage', customers: 'orders.manage' };
    if (destination !== 'stock-override' && permissionByPage[destination] && !user.permissions?.includes(permissionByPage[destination])) { setToast('Tu rol no tiene acceso a esta sección.'); return; }
    closeAdminSections();
    if (destination === 'products') { setProductAdminTab('catalog'); setProductsOpen(true); }
    else if (destination === 'labels') setLabelsOpen(true);
    else if (destination === 'combos') setCombosOpen(true);
    else if (destination === 'reports') setReportsOpen(true);
    else if (destination === 'users') setUsersOpen(true);
    else if (destination === 'inventory') setInventoryOpen(true);
    else if (destination === 'orders') setOrdersOpen(true);
    else if (destination === 'customers') setCustomersOpen(true);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.replace('/');
  };

  const requestStockOverride = () => {
    if (!can('stock.override')) { setStockWarningOpen(false); setToast('Tu rol no puede autorizar ventas sin stock.'); return; }
    setStockWarningOpen(false); setAllowNegativeStock(true); launchPayment();
  };

  useEffect(() => {
    if (!productsOpen || productAdminTab !== 'movements') return undefined;
    let cancelled = false;
    setLoadingMovements(true);
    fetch('/api/inventory/movements')
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || 'No se pudo cargar el historial.');
        return data;
      })
      .then((data) => { if (!cancelled && Array.isArray(data)) setInventoryMovements(data); })
      .catch((error) => { if (!cancelled) setToast(error.message); })
      .finally(() => { if (!cancelled) setLoadingMovements(false); });
    return () => { cancelled = true; };
  }, [productsOpen, productAdminTab]);

  useEffect(() => {
    let cancelled = false;
    if (!adminAuthenticated) {
      setProducts((current) => current.map(({ cost, supplier, targetMargin, priceRoundTo, ...product }) => product));
      return undefined;
    }
    fetch('/api/products')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!cancelled && Array.isArray(data)) setProducts(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [adminAuthenticated]);

  useEffect(() => {
    if (!productsOpen || productAdminTab !== 'value-history') return undefined;
    let cancelled = false;
    setLoadingValueHistory(true);
    fetch('/api/products/value-history')
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || 'No se pudo cargar el historial de valores.');
        return data;
      })
      .then((data) => { if (!cancelled && Array.isArray(data)) setValueHistory(data); })
      .catch((error) => { if (!cancelled) setToast(error.message); })
      .finally(() => { if (!cancelled) setLoadingValueHistory(false); });
    return () => { cancelled = true; };
  }, [productsOpen, productAdminTab]);
  const focusScanner = useCallback(() => {
    window.requestAnimationFrame(() => scannerRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (!authLoading && adminAuthenticated) focusScanner();
  }, [authLoading, adminAuthenticated, focusScanner]);

  useEffect(() => {
    let active = true;
    let cameraWarmup;
    const initialize = async () => {
      try {
        const authResponse = await fetch('/api/auth/status');
        const auth = await authResponse.json().catch(() => null);
        if (!authResponse.ok) throw new Error(auth?.message || 'No se pudo verificar el acceso.');
        if (!auth?.authenticated || !auth.user) {
          window.location.replace('/login');
          return;
        }
        if (!active) return;
        setAdminAuthenticated(true);
        setCurrentUser(auth.user);
        const [healthResponse, productsResponse, combosResponse] = await Promise.all([
          fetch('/api/health'), fetch('/api/products'), fetch('/api/combos/public'),
        ]);
        if (!active) return;
        if (productsResponse.status === 401 || productsResponse.status === 403) {
          window.location.replace('/login');
          return;
        }
        const health = healthResponse.ok ? await healthResponse.json().catch(() => null) : null;
        const data = productsResponse.ok ? await productsResponse.json().catch(() => null) : null;
        const comboData = combosResponse.ok ? await combosResponse.json().catch(() => null) : null;
        setConnected(health?.database === true);
        if (Array.isArray(data)) setProducts(data);
        if (Array.isArray(comboData)) setCombos(comboData);
        const permissions = auth.user.permissions || [];
        if (!permissions.includes('sales.create')) {
          if (permissions.includes('inventory.manage')) openAdminPage('inventory', auth.user);
          else if (permissions.includes('labels.manage')) openAdminPage('labels', auth.user);
          else if (permissions.includes('products.manage')) openAdminPage('products', auth.user);
          else {
            await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            window.location.replace('/login');
            return;
          }
        }
        cameraWarmup = window.setTimeout(preloadCameraDecoder, 600);
      } catch (error) {
        if (active) setAuthError(error.message || 'No se pudo verificar el acceso.');
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    initialize();
    return () => { active = false; window.clearTimeout(cameraWarmup); };
  }, []);

  useEffect(() => {
    if (!adminAuthenticated) return undefined;
    let active = true;
    let refreshing = false;
    const refreshCatalog = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const [healthResponse, productsResponse, combosResponse] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/products'),
          fetch('/api/combos/public'),
        ]);
        if (!active) return;
        if (productsResponse.status === 401) {
          window.location.replace('/login');
          return;
        }
        if (!healthResponse.ok || !productsResponse.ok || !combosResponse.ok) {
          setConnected(false);
          return;
        }
        const health = await healthResponse.json().catch(() => null);
        if (productsResponse.ok) {
          const data = await productsResponse.json().catch(() => null);
          if (Array.isArray(data)) setProducts(data);
        }
        if (combosResponse.ok) {
          const data = await combosResponse.json().catch(() => null);
          if (Array.isArray(data)) setCombos(data);
        }
        setConnected(health?.database === true);
      } catch {
        if (active) setConnected(false);
      } finally {
        refreshing = false;
      }
    };
    const timer = window.setInterval(refreshCatalog, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [adminAuthenticated]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => { setToast(''); setPendingBarcode(''); }, pendingBarcode ? 7000 : 2200);
    return () => window.clearTimeout(timer);
  }, [toast, pendingBarcode]);

  useEffect(() => {
    if (cameraOpen || !recentProductId) return undefined;
    const frame = window.requestAnimationFrame(() => productCardRefs.current.get(String(recentProductId))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    const timer = window.setTimeout(() => setRecentProductId(''), 2600);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [cameraOpen, recentProductId]);

  const addProduct = useCallback((product, { refocus = true } = {}) => {
    const isCombo = Boolean(product.comboId);
    const productId = isCombo ? 'combo:' + String(product.comboId) : String(product._id);
    const cartItem = cart.find((row) => String(row.productId) === productId);
    if (false && Number.isInteger(product.stock) && (cartItem?.quantity || 0) >= product.stock) {
      setToast(product.stock === 0 ? 'Producto sin stock. Ingresá mercadería para venderlo.' : `Stock insuficiente. Disponible: ${product.stock}.`);
      setQuery('');
      if (refocus) focusScanner();
      return;
    }
    const wasInCart = Boolean(cartItem);
    setCart((current) => {
      if (current.some((row) => String(row.productId) === productId)) return current.map((row) => String(row.productId) === productId ? { ...row, quantity: row.quantity + 1 } : row);
      return [...current, { productId, ...(isCombo ? { comboId: String(product.comboId) } : {}), name: product.name, price: product.price, quantity: 1 }];
    });
    setToast(wasInCart ? 'Cantidad actualizada' : 'Producto agregado');
    setQuery('');
    setCategory('Todos');
    if (refocus) focusScanner();
  }, [cart, focusScanner]);

  const handleCameraScan = useCallback((barcode) => {
    const normalizedBarcode = (value) => String(value || '').trim().replace(/\s+/g, '');
    if (cameraMode === 'product') {
      setProductForm((current) => ({ ...current, barcode: normalizedBarcode(barcode) }));
      return `Código capturado: ${normalizedBarcode(barcode)}`;
    }
    if (cameraMode === 'catalog') {
      const scanned = normalizedBarcode(barcode);
      setProductCatalogQuery(scanned);
      const match = products.find((item) => normalizedBarcode(item.barcode) === scanned);
      return match ? `Producto encontrado: ${match.name}` : 'Código capturado. No hay un producto con ese EAN.';
    }
    const product = products.find((item) => normalizedBarcode(item.barcode) === normalizedBarcode(barcode));
    if (!product) {
      setToast('Producto no encontrado. Buscá el producto o verificá su código');
      return '';
    }
    addProduct(product, { refocus: false });
    setQuery(product.name);
    setCategory('Todos');
    setRecentProductId(String(product._id));
    return `Producto agregado: ${product.name}`;
  }, [cameraMode, products, addProduct]);

  const closeCamera = () => {
    setCameraOpen(false);
    window.requestAnimationFrame(() => {
      if (cameraMode === 'product') productBarcodeRef.current?.focus({ preventScroll: true });
      else if (cameraMode === 'catalog') productCatalogSearchRef.current?.focus({ preventScroll: true });
      else if (!recentProductId) scannerRef.current?.focus({ preventScroll: true });
    });
  };

  const openCamera = (mode) => {
    preloadCameraDecoder();
    setRecentProductId('');
    setCameraMode(mode);
    setCameraOpen(true);
  };

  const handleScan = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const entered = event.currentTarget.value.trim();
    if (!entered) return;
    const normalizedBarcode = (value) => String(value || '').trim().replace(/\s+/g, '');
    const exact = products.find((product) => normalizedBarcode(product.barcode) === normalizedBarcode(entered));
    if (exact) {
      addProduct(exact);
      return;
    }
    const isLikelyBarcode = /^[\d\s-]+$/.test(entered);
    if (!isLikelyBarcode && visibleProducts.length) {
      addProduct(visibleProducts[0]);
      return;
    }
    setToast('Producto no encontrado. Buscá el producto o verificá su código');
    setPendingBarcode(/^[\d\s-]+$/.test(entered) ? entered.replace(/\s+/g, '') : '');
    setQuery('');
    focusScanner();
  };

  const changeQuantity = (productId, amount) => {
    const product = products.find((item) => String(item._id) === String(productId));
    const cartItem = cart.find((item) => String(item.productId) === String(productId));
    if (false && amount > 0 && Number.isInteger(product?.stock) && (cartItem?.quantity || 0) >= product.stock) {
      setToast(`Stock insuficiente. Disponible: ${product.stock}.`);
      focusScanner();
      return;
    }
    setCart((current) => current
      .map((row) => String(row.productId) === String(productId) ? { ...row, quantity: Math.max(0, row.quantity + amount) } : row)
      .filter((row) => row.quantity > 0));
    focusScanner();
  };

  const setQuantity = (productId, value) => {
    if (value === '') return;
    const amount = Number.parseInt(value, 10);
    if (!Number.isInteger(amount) || amount < 1) return;
    const product = products.find((item) => String(item._id) === String(productId));
    if (false && Number.isInteger(product?.stock) && amount > product.stock) {
      setToast(`Stock insuficiente. Disponible: ${product.stock}.`);
      return;
    }
    setCart((current) => current.map((row) => String(row.productId) === String(productId) ? { ...row, quantity: amount } : row));
  };

  const removeProduct = (productId) => {
    setCart((current) => current.filter((row) => row.productId !== productId));
    focusScanner();
  };

  const clearCart = () => {
    if (!cart.length) return;
    if (window.confirm('¿Querés cancelar esta venta y vaciar el carrito?')) {
      setCart([]);
      setToast('Venta cancelada');
      focusScanner();
    }
  };

  const openPayment = () => {
    if (!cart.length) return;
    setCartOpen(false);
    setAllowNegativeStock(false);
    if (stockShortages.length) {
      setStockWarningOpen(true);
      return;
    }
    launchPayment();
  };

  const launchPayment = () => {
    setPaymentMethod('Efectivo');
    setPaid(String(total));
    setPaymentOpen(true);
  };

  const closePayment = () => {
    setPaymentOpen(false);
    setAllowNegativeStock(false);
    focusScanner();
  };

  const finishSale = async () => {
    if (paymentMethod === 'Efectivo' && Number(paid) < total) return;
    setBusy(true);
    let saved = false;
    try {
      const response = await fetch('/api/sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart, total, paymentMethod, paid: Number(paid) || total, allowNegativeStock }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setToast(result?.message || 'No se pudo registrar la venta. Revisá la cuenta e intentá otra vez.');
        setBusy(false);
        return;
      }
      if (Array.isArray(result?.stockUpdates)) {
        setProducts((current) => current.map((product) => {
          const update = result.stockUpdates.find((item) => String(item.productId) === String(product._id));
          return update ? { ...product, stock: update.stock } : product;
        }));
      }
      if (cart.some((item) => item.comboId)) { const comboResponse = await fetch('/api/combos/public'); const comboData = await comboResponse.json().catch(() => null); if (Array.isArray(comboData)) setCombos(comboData); }
      saved = result?.persisted === true;
    } catch { /* Demo mode keeps the sale flow available without a running server. */ }
    setBusy(false);
    setPaymentOpen(false);
    setStockWarningOpen(false);
    setAllowNegativeStock(false);
    setCart([]);
    setQuery('');
    setToast(saved ? 'Venta completada' : 'Venta completada en modo de prueba (no guardada en MongoDB)');
    focusScanner();
  };

  const resetProductForm = () => {
    setEditingProduct('');
    setProductForm({ name: '', barcode: '', sku: '', supplier: '', detail: '', price: '', cost: '', additionalCost: '', stock: '0', minStock: '5', targetMargin: '35', priceRoundTo: '50', publishedOnline: false, valueChangeReason: '', category: 'Otros', stockReason: '', imageUrl: '', imagePublicId: '' });
  };

  const uploadProductImage = async (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setToast('Elegí una imagen JPG, PNG, WEBP o AVIF de hasta 5 MB.');
      return;
    }
    setUploadingProductImage(true);
    try {
      const signatureResponse = await fetch('/api/uploads/product-image/signature', { method: 'POST' });
      const signed = await signatureResponse.json().catch(() => null);
      if (!signatureResponse.ok) throw new Error(signed?.message || 'No se pudo preparar la carga de la imagen.');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signed.apiKey);
      formData.append('timestamp', signed.timestamp);
      formData.append('public_id', signed.public_id);
      formData.append('overwrite', signed.overwrite);
      formData.append('signature', signed.signature);
      const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`, { method: 'POST', body: formData });
      const uploaded = await uploadResponse.json().catch(() => null);
      if (!uploadResponse.ok || !uploaded?.secure_url || !uploaded?.public_id) throw new Error(uploaded?.error?.message || 'Cloudinary no pudo guardar la imagen.');
      setProductForm((current) => ({ ...current, imageUrl: uploaded.secure_url, imagePublicId: uploaded.public_id }));
      setToast('Imagen subida a Cloudinary');
    } catch (error) {
      setToast(error.message || 'No se pudo subir la imagen.');
    } finally {
      setUploadingProductImage(false);
    }
  };

  const submitProduct = async (event) => {
    event.preventDefault();
    setSavingProduct(true);
    try {
      const response = await fetch(editingProduct ? `/api/products/${editingProduct}` : '/api/products', {
        method: editingProduct ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...productForm, price: Number(productForm.price), cost: productForm.cost === '' ? null : Number(productForm.cost), additionalCost: productForm.additionalCost === '' ? 0 : Number(productForm.additionalCost), minStock: Number(productForm.minStock), targetMargin: Number(productForm.targetMargin), priceRoundTo: Number(productForm.priceRoundTo), stock: Number(productForm.stock), category: productForm.category || 'Otros', publishedOnline: productForm.publishedOnline }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo guardar el producto.');
      setProducts((current) => editingProduct ? current.map((item) => String(item._id) === String(editingProduct) ? result : item) : [...current, result]);
      if (editingProduct) setCart((current) => current.map((item) => String(item.productId) === String(editingProduct) ? { ...item, name: result.name, price: result.price } : item));
      resetProductForm();
      setProductModalOpen(false);
      setProductAdminTab('catalog');
      setToast(editingProduct ? 'Producto actualizado' : 'Producto guardado');
      setPendingBarcode('');
    } catch (error) { setToast(error.message || 'No se pudo guardar el producto.'); }
    finally { setSavingProduct(false); }
  };

  const receiveStock = async (event) => {
    event.preventDefault();
    const quantity = Number(stockReceiptQuantity);
    if (!stockReceiptProduct || !Number.isInteger(quantity) || quantity < 1) return;
    setSavingStock(true);
    try {
      const response = await fetch(`/api/products/${stockReceiptProduct._id}/stock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity, reason: stockReceiptReason, type: stockMovementType }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo ingresar el stock.');
      setProducts((current) => current.map((item) => String(item._id) === String(result._id) ? result : item));
      setStockReceiptProduct(null);
      setStockReceiptQuantity('');
      setStockReceiptReason('');
      setToast(`Stock actualizado: ${result.stock} unidades de ${result.name}.`);
    } catch (error) { setToast(error.message || 'No se pudo ingresar el stock.'); }
    finally { setSavingStock(false); }
  };

  const startEditing = (product) => {
    setProductAdminTab('catalog');
    setEditingProduct(product._id);
    setProductForm({ name: product.name, barcode: product.barcode || '', sku: product.sku || '', supplier: product.supplier || '', detail: product.detail || '', price: String(product.price), cost: product.cost ?? '', additionalCost: product.additionalCost ?? '', stock: String(product.stock ?? 0), minStock: String(product.minStock ?? 5), targetMargin: String(Math.round((product.targetMargin ?? 0.35) * 100)), priceRoundTo: String(product.priceRoundTo ?? 50), publishedOnline: product.publishedOnline === true && (!Number.isInteger(product.stock) || product.stock > 0), valueChangeReason: '', category: product.category || 'Otros', stockReason: '', imageUrl: product.imageUrl || '', imagePublicId: product.imagePublicId || '', imageSource: product.imageSource || '', imageSourceUrl: product.imageSourceUrl || '' });
    setProductModalOpen(true);
  };

  const toggleOnlinePublication = async (product) => {
    const nextValue = !(product.publishedOnline === true);
    if (nextValue && Number.isInteger(product.stock) && product.stock <= 0) return;
    setPublicationSavingId(String(product._id));
    try {
      const response = await fetch(`/api/products/${product._id}/publication`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publishedOnline: nextValue }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo actualizar la publicación.');
      setProducts((current) => current.map((item) => String(item._id) === String(product._id) ? result : item));
      setToast(result.publishedOnline ? 'Producto publicado en el catálogo online.' : 'Producto oculto del catálogo online.');
    } catch (error) { setToast(error.message || 'No se pudo actualizar la publicación.'); }
    finally { setPublicationSavingId(''); }
  };
  const archiveProduct = async (product) => {
    if (!window.confirm(`¿Eliminar “${product.name}” del catálogo? Las ventas anteriores se conservan.`)) return;
    try {
      const response = await fetch(`/api/products/${product._id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo quitar el producto.');
      setProducts((current) => current.filter((item) => item._id !== product._id));
      setCart((current) => current.filter((item) => String(item.productId) !== String(product._id)));
      setToast('Producto eliminado del catálogo');
      if (String(editingProduct) === String(product._id)) resetProductForm();
    } catch (error) { setToast(error.message || 'No se pudo quitar el producto.'); }
  };

  const formCost = productForm.cost === '' ? null : Number(productForm.cost) + (Number(productForm.additionalCost) || 0);
  const formTargetMargin = Number(productForm.targetMargin) / 100;
  const formSuggestedPrice = formCost === null ? null : suggestedPrice(formCost, formTargetMargin, Number(productForm.priceRoundTo));
  const formPrice = Number(productForm.price);
  const formGrossMargin = formCost !== null && formPrice > 0 ? ((formPrice - formCost) / formPrice) * 100 : null;
  const formMarkup = formCost !== null && formCost > 0 ? ((formPrice - formCost) / formCost) * 100 : null;
  const productFormContent = <>
    <form className="product-form" ref={productFormRef} onSubmit={submitProduct}>
      <div className="product-image-upload">
        <div className="product-image-preview">{productForm.imageUrl ? <img src={productForm.imageUrl} alt="Vista previa del producto" /> : <ImagePlus size={30} aria-hidden="true" />}</div>
        <div className="product-image-controls"><strong>Imagen del producto</strong><small>JPG, PNG, WEBP o AVIF · máximo 5 MB</small><label className="product-image-button"><ImagePlus size={16} />{uploadingProductImage ? 'Subiendo…' : productForm.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploadingProductImage} onChange={(event) => { uploadProductImage(event.target.files?.[0]); event.target.value = ''; }} /></label></div>
        {productForm.imageUrl && <button className="product-image-remove" type="button" disabled={uploadingProductImage} onClick={() => setProductForm((current) => ({ ...current, imageUrl: '', imagePublicId: '', imageSource: '', imageSourceUrl: '' }))} aria-label="Quitar imagen"><X size={18} /></button>}
      </div>
      <label>Nombre *<input ref={productNameRef} required maxLength="120" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} placeholder="Ej.: Yerba 1 kg" /></label>
      <label>Código de barras / EAN<div className="barcode-input-row"><input ref={productBarcodeRef} maxLength="80" value={productForm.barcode} onChange={(event) => setProductForm({ ...productForm, barcode: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Escaneá o escribí el EAN" autoComplete="off" /><button className="barcode-camera-button" type="button" onClick={() => openCamera('product')} aria-label="Leer código de barras con la cámara"><Camera size={18} /><span>Cámara</span></button></div></label>
      <label>SKU / código interno<input maxLength="60" value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} placeholder="Ej.: YER-001" /></label>
      <label>Proveedor<input maxLength="120" value={productForm.supplier} onChange={(event) => setProductForm({ ...productForm, supplier: event.target.value })} placeholder="Nombre del proveedor" /></label>
      <label>Precio de costo<input type="number" min="0" step="0.01" value={productForm.cost} onChange={(event) => setProductForm({ ...productForm, cost: event.target.value })} placeholder="Sin informar" /></label>
      <label>Gastos de adquisición por unidad<input type="number" min="0" step="0.01" value={productForm.additionalCost} onChange={(event) => setProductForm({ ...productForm, additionalCost: event.target.value })} placeholder="Opcional" /></label>
      <label>Precio de venta *<input required type="number" min="0" step="0.01" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} placeholder="0" /></label>
      <label>Stock mínimo<input required type="number" min="0" step="1" value={productForm.minStock} onChange={(event) => setProductForm({ ...productForm, minStock: event.target.value })} /></label>
      <label>Margen objetivo (%)<input required type="number" min="0" max="95" step="1" value={productForm.targetMargin} onChange={(event) => setProductForm({ ...productForm, targetMargin: event.target.value })} /></label>
      <label>Redondear precio sugerido<select value={productForm.priceRoundTo} onChange={(event) => setProductForm({ ...productForm, priceRoundTo: event.target.value })}><option value="1">Al peso</option><option value="10">A $10</option><option value="50">A $50</option><option value="100">A $100</option><option value="500">A $500</option></select></label>
      <label>{editingProduct ? 'Stock actual *' : 'Stock inicial *'}<input required type="number" min={editingProduct ? '-10000000' : '0'} max="10000000" step="1" inputMode="numeric" value={productForm.stock} onChange={(event) => setProductForm((current) => { const stock = event.target.value; const wasAvailable = Number(current.stock) > 0; const isAvailable = Number(stock) > 0; return { ...current, stock, publishedOnline: isAvailable ? (wasAvailable ? current.publishedOnline : true) : false }; })} placeholder="0" /><small className="stock-field-help">Unidades disponibles para vender.</small></label>
      {editingProduct && <label>Motivo del ajuste *<input required maxLength="240" value={productForm.stockReason} onChange={(event) => setProductForm({ ...productForm, stockReason: event.target.value })} placeholder="Ej.: conteo físico" /></label>}
      <div className="pricing-preview">
        <div><span>Costo total</span><strong>{formCost === null ? 'Sin informar' : money(formCost)}</strong></div>
        <div><span>Venta actual</span><strong>{formPrice >= 0 ? money(formPrice) : '—'}</strong></div>
        <div><span>Sugerido</span><strong>{formSuggestedPrice === null ? 'Completá costo y margen' : money(formSuggestedPrice)}</strong></div>
        <div><span>Ganancia bruta</span><strong>{formCost === null ? '—' : money(formPrice - formCost)}</strong></div>
        <div><span>Margen / recargo</span><strong>{formGrossMargin === null ? '—' : formGrossMargin.toFixed(1) + '% / ' + (formMarkup ?? 0).toFixed(1) + '%'}</strong></div>
        {formGrossMargin !== null && formGrossMargin < Number(productForm.targetMargin) && <small className="pricing-warning">El precio actual queda por debajo del margen objetivo.</small>}
        <button type="button" disabled={formSuggestedPrice === null} onClick={() => setProductForm((current) => ({ ...current, price: String(formSuggestedPrice) }))}>Aplicar precio sugerido</button>
      </div>
      <label>Motivo del cambio de costo o precio<input maxLength="240" value={productForm.valueChangeReason} onChange={(event) => setProductForm({ ...productForm, valueChangeReason: event.target.value })} placeholder="Opcional" /></label>
      <label>Categoría<select required value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })}>{!businessCategories.includes(productForm.category) && productForm.category && <option value={productForm.category}>{productForm.category}</option>}{businessCategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="product-detail-field">Detalle<input maxLength="240" value={productForm.detail} onChange={(event) => setProductForm({ ...productForm, detail: event.target.value })} placeholder="Presentación, marca, tamaño…" /></label>
      <label className={`product-publish-toggle ${Number(productForm.stock) > 0 ? "is-available" : "is-out-of-stock"}`}><input type="checkbox" role="switch" checked={productForm.publishedOnline && Number(productForm.stock) > 0} disabled={Number(productForm.stock) <= 0} onChange={(event) => setProductForm((current) => ({ ...current, publishedOnline: event.target.checked }))} /><span className="publish-switch" aria-hidden="true"></span><span className="publish-toggle-copy"><strong>Mostrar en catálogo online</strong><small>{Number(productForm.stock) > 0 ? "El producto está disponible y visible para tus clientes." : "Sin stock: se publicará automáticamente cuando registres unidades."}</small></span></label>
      <div className="product-form-actions"><button className="confirm-payment" type="submit" disabled={savingProduct || uploadingProductImage || !connected}><Check size={18} />{savingProduct ? 'Guardando…' : editingProduct ? 'Guardar cambios' : 'Agregar producto'}</button>{editingProduct && <button className="back-to-sale" type="button" onClick={resetProductForm}>Cancelar edición</button>}</div>
    </form>
    {!productModalOpen && <button className="back-to-sale product-form-back" type="button" onClick={() => { resetProductForm(); setProductAdminTab('catalog'); }}>Volver al catálogo</button>}
  </>;

  if (authLoading) return <main className="staff-login-page"><p className="staff-login-status">Verificando acceso…</p></main>;
  if (authError) return <main className="staff-login-page"><section className="staff-login-card"><h1>No se pudo verificar el acceso</h1><p className="staff-login-error" role="alert">{authError}</p><a className="staff-login-error-back" href="/login">Volver al inicio de sesión</a></section></main>;
  if (!adminAuthenticated || !currentUser) return null;

  return (
    <div className="app-shell">
      {cameraOpen && <CameraScanner onScan={handleCameraScan} onClose={closeCamera} closeAfterScan />}
      <aside className="desktop-sidebar" aria-label="Navegación principal">
        <div className="sidebar-brand"><div className="brand-icon"><Store size={23} /></div><div><strong>LOS OSMAN</strong><span>{customersOpen ? 'Clientes' : ordersOpen ? 'Pedidos online' : inventoryOpen ? 'Inventario' : labelsOpen ? 'Etiquetas' : productsOpen ? 'Productos' : 'Punto de venta'}</span></div></div>
        <nav className="sidebar-nav">
          {can('sales.create') && <button type="button" className={!productsOpen && !labelsOpen && !combosOpen && !reportsOpen && !usersOpen && !inventoryOpen && !ordersOpen && !customersOpen ? 'active' : ''} onClick={() => { closeAdminSections(); }}><ShoppingBasket size={19} /> Punto de venta</button>}
          {can('products.manage') && <button type="button" className={productsOpen ? 'active' : ''} onClick={() => openAdminPage('products')}><PackagePlus size={19} /> Productos</button>}
          {can('inventory.manage') && <button type="button" className={inventoryOpen ? 'active' : ''} onClick={() => openAdminPage('inventory')}><ClipboardList size={19} /> Inventario</button>}
          {can('orders.manage') && <button type="button" className={ordersOpen ? 'active' : ''} onClick={() => openAdminPage('orders')}><ShoppingBasket size={19} /> Pedidos online</button>}
          {can('orders.manage') && <button type="button" className={customersOpen ? 'active' : ''} onClick={() => openAdminPage('customers')}><UsersRound size={19} /> Clientes</button>}
          {can('labels.manage') && <button type="button" className={labelsOpen ? 'active' : ''} onClick={() => openAdminPage('labels')}><Tag size={19} /> Etiquetas</button>}
          {can('combos.manage') && <button type="button" className={combosOpen ? 'active' : ''} onClick={() => openAdminPage('combos')}><PackagePlus size={19} /> Combos</button>}
          {can('reports.view') && <button type="button" className={reportsOpen ? 'active' : ''} onClick={() => openAdminPage('reports')}><BadgeCheck size={19} /> Reportes</button>}
          {can('users.manage') && <button type="button" className={usersOpen ? 'active' : ''} onClick={() => openAdminPage('users')}><UsersRound size={19} /> Usuarios y roles</button>}
        </nav>
        <div className={`sidebar-connection ${connected ? 'is-live' : ''}`}><span />{connected ? 'Sistema conectado' : 'Modo de prueba'}</div>
      </aside>
      {mobileNavOpen && <div className="mobile-nav-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileNavOpen(false); }}>
        <nav className="mobile-nav-drawer" aria-label="Navegación principal">
          <div className="mobile-drawer-heading"><div className="brand-icon"><Store size={22} /></div><strong>LOS OSMAN</strong><button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Cerrar menú"><X size={20} /></button></div>
          {can('sales.create') && <button type="button" className={!productsOpen && !labelsOpen && !combosOpen && !reportsOpen && !usersOpen && !inventoryOpen && !ordersOpen && !customersOpen ? 'active' : ''} onClick={() => { closeAdminSections(); setMobileNavOpen(false); }}><ShoppingBasket size={19} /> Punto de venta</button>}
          {can('products.manage') && <button type="button" className={productsOpen ? 'active' : ''} onClick={() => { openAdminPage('products'); setMobileNavOpen(false); }}><PackagePlus size={19} /> Productos</button>}
          {can('inventory.manage') && <button type="button" className={inventoryOpen ? 'active' : ''} onClick={() => { openAdminPage('inventory'); setMobileNavOpen(false); }}><ClipboardList size={19} /> Inventario</button>}
          {can('orders.manage') && <button type="button" className={ordersOpen ? 'active' : ''} onClick={() => { openAdminPage('orders'); setMobileNavOpen(false); }}><ShoppingBasket size={19} /> Pedidos online</button>}
          {can('orders.manage') && <button type="button" className={customersOpen ? 'active' : ''} onClick={() => { openAdminPage('customers'); setMobileNavOpen(false); }}><UsersRound size={19} /> Clientes</button>}
          {can('labels.manage') && <button type="button" className={labelsOpen ? 'active' : ''} onClick={() => { openAdminPage('labels'); setMobileNavOpen(false); }}><Tag size={19} /> Etiquetas</button>}
          {can('combos.manage') && <button type="button" className={combosOpen ? 'active' : ''} onClick={() => { openAdminPage('combos'); setMobileNavOpen(false); }}><PackagePlus size={19} /> Combos</button>}
          {can('reports.view') && <button type="button" className={reportsOpen ? 'active' : ''} onClick={() => { openAdminPage('reports'); setMobileNavOpen(false); }}><BadgeCheck size={19} /> Reportes</button>}
          {can('users.manage') && <button type="button" className={usersOpen ? 'active' : ''} onClick={() => { openAdminPage('users'); setMobileNavOpen(false); }}><UsersRound size={19} /> Usuarios y roles</button>}
        </nav>
      </div>}
      <header className="topbar">
        <button className="mobile-menu-button" type="button" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
        <div className="brand-wrap">
          <div className="brand-icon"><Store size={24} strokeWidth={2.6} /></div>
          <div><div className="brand-name">LOS OSMAN</div><div className="brand-subtitle">{customersOpen ? 'Clientes' : ordersOpen ? 'Pedidos online' : inventoryOpen ? 'Inventario' : labelsOpen ? 'Etiquetas' : productsOpen ? 'Productos' : 'Punto de venta'}</div></div>
          <span className={`connection-pill ${connected ? 'is-live' : ''}`}><span />{connected ? 'Sistema conectado' : 'Modo de prueba'}</span>
        </div>
        <div className="topbar-actions"><span className="signed-in-user">{currentUser.displayName} · {currentUser.role}</span><button className="manage-button" type="button" onClick={handleLogout}><LogOut size={17} /> Cerrar sesión</button>{can('sales.create') && <button className="help-button" type="button" onClick={() => setToast('Escaneá un producto o buscá por nombre. Luego tocá Cobrar.')}><CircleHelp size={19} /> Ayuda</button>}</div>
      </header>

      {can('sales.create') && !productsOpen && !labelsOpen && !combosOpen && !reportsOpen && !usersOpen && !inventoryOpen && !ordersOpen && !customersOpen && <main className="layout">
        <section className="catalog-column" aria-label="Productos">
          <div className="scanner-card">
            <div className="product-entry-actions"><button type="button" className="add-product-primary" onClick={() => { if (can('products.manage')) { resetProductForm(); setProductModalOpen(true); } else setToast('Tu rol no puede cargar productos.'); }}><PackagePlus size={17} /> Agregar producto</button></div>
            <div className="camera-entry-row"><span>También podés usar la cámara del celular.</span><button className="camera-scan-button" type="button" onClick={() => openCamera('sale')}><Camera size={17} /> Escanear con cámara</button></div>
            <label className="scanner-label" htmlFor="scanner-input"><Barcode size={18} /> BUSCAR O ESCANEAR</label>
            <div className="scanner-control">
              <Search className="search-icon" size={23} />
              <input
                id="scanner-input" ref={scannerRef} value={query} onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleScan} placeholder="Escaneá el código o escribí el nombre…"
                autoComplete="off" autoCapitalize="off" spellCheck="false" aria-describedby="scanner-help"
              />
              {query && <button className="clear-search" type="button" onClick={() => { setQuery(''); focusScanner(); }} aria-label="Limpiar búsqueda"><X size={18} /></button>}
              <span className="enter-hint">ENTER</span>
            </div>
            <div className="scanner-foot"><span className="ready-dot" /> <span id="scanner-help">Lector listo para escanear · escaneá el producto con la pistolita o buscá por nombre</span><span className="shortcut">Foco automático</span></div>
          </div>

          <div className="section-heading"><div><h1>Productos</h1><p>Elegí un producto para agregarlo a la cuenta.</p></div><span className="result-count">{visibleProducts.length} productos</span></div>
          <div className="category-strip" aria-label="Filtrar por categoría">
            {categories.map((item) => <button key={item} type="button" className={`category-chip ${category === item ? 'selected' : ''}`} onClick={() => { setCategory(item); focusScanner(); }}>{item}</button>)}
          </div>

          {visibleProducts.length ? <div className="product-grid">
          {visibleProducts.map((product) => <button type="button" className={`product-card ${recentProductId === String(product._id) ? 'product-card-recent' : ''}`} key={product._id} ref={(element) => { if (element) productCardRefs.current.set(String(product._id), element); else productCardRefs.current.delete(String(product._id)); }} onClick={() => addProduct(product)}>
              <div className="product-card-top"><span className="product-category">{product.category}</span><span className="add-icon"><Plus size={19} /></span></div>
              {product.imageUrl && <img className="product-card-image" src={product.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
              <span className="product-title">{product.name}</span>
              <span className="product-detail">{product.detail || `Código ${product.barcode || 'sin código'}`}</span>
              <span className={`product-stock ${Number.isInteger(product.stock) && product.stock <= 5 ? 'product-stock-low' : ''}`}>{Number.isInteger(product.stock) ? product.stock < 0 ? `Faltante: ${Math.abs(product.stock)}` : `Stock: ${product.stock}` : 'Stock sin configurar'}</span>
              <span className="product-price">{money(product.price)}</span>
            </button>)}
          </div> : <div className="empty-search"><Search size={24} /><strong>No encontramos productos</strong><span>Probá con otro nombre o verificá el código.</span></div>}
        </section>

        {cart.length > 0 && <button className="mobile-cart-access" type="button" onClick={() => setCartOpen(true)}><ShoppingBasket size={20} /><span><strong>Ver cuenta · {itemCount}</strong><small>{money(total)}</small></span><ChevronDown size={18} /></button>}
        <aside className={`cart-panel ${cartOpen ? 'is-open' : ''}`} aria-label="Cuenta actual">
          {cartOpen && <button className="cart-close-button" type="button" onClick={() => setCartOpen(false)} aria-label="Cerrar cuenta"><X size={20} /></button>}
          <div className="cart-heading"><div className="cart-icon"><ShoppingBasket size={21} /></div><div><h2>Cuenta actual</h2><p>{itemCount ? `${itemCount} ${itemCount === 1 ? 'producto' : 'productos'}` : 'Lista para empezar'}</p></div><span className="cart-count">{itemCount}</span></div>
          <div className="cart-list" aria-live="polite">
            {cart.length ? cart.map((item) => <div className="cart-row" key={item.productId}>
              <div className="cart-product"><strong title={item.name}>{item.name}</strong><span>{money(item.price)} c/u</span></div>
              <div className="quantity-control">
                <button type="button" onClick={() => changeQuantity(item.productId, -1)} aria-label={`Restar ${item.name}`}><Minus size={15} /></button>
                <input aria-label={`Cantidad de ${item.name}`} inputMode="numeric" type="number" min="1" value={item.quantity} onChange={(event) => setQuantity(item.productId, event.target.value)} onBlur={focusScanner} />
                <button type="button" onClick={() => changeQuantity(item.productId, 1)} aria-label={`Sumar ${item.name}`}><Plus size={15} /></button>
              </div>
              <strong className="line-total">{money(item.price * item.quantity)}</strong>
              <button className="remove-button" type="button" onClick={() => removeProduct(item.productId)} aria-label={`Quitar ${item.name}`}><Trash2 size={16} /></button>
            </div>) : <div className="cart-empty"><div className="empty-bag"><ShoppingBasket size={26} /></div><strong>Tu cuenta está vacía</strong><span>Escaneá o elegí un producto para empezar.</span></div>}
          </div>
          <div className="cart-bottom">
            <div className="total-row"><div><span>Total a pagar</span><small>Pesos argentinos</small></div><strong>{money(total)}</strong></div>
            <button className="checkout-button" type="button" onClick={openPayment} disabled={!cart.length}><Banknote size={22} /> COBRAR</button>
            <button className="cancel-sale" type="button" onClick={clearCart} disabled={!cart.length}><X size={16} /> Cancelar venta</button>
          </div>
        </aside>
      </main>}

      {toast && <div className={`toast ${toast.startsWith('Producto no encontrado') || toast.startsWith('Stock insuficiente') || toast.startsWith('Producto sin stock') ? 'toast-error' : ''}`} role="status"><span className="toast-symbol">{toast.startsWith('Producto no encontrado') || toast.startsWith('Stock insuficiente') || toast.startsWith('Producto sin stock') ? <CircleHelp size={17} /> : <Check size={17} />}</span><span>{toast}</span>{pendingBarcode && <button className="toast-action" type="button" onClick={() => { if (!can('products.manage')) { setToast('Tu rol no puede cargar productos.'); return; } setProductForm({ name: '', barcode: pendingBarcode, sku: '', supplier: '', detail: '', price: '', cost: '', additionalCost: '', stock: '0', minStock: '5', targetMargin: '35', priceRoundTo: '50', publishedOnline: false, valueChangeReason: '', category: 'Otros', stockReason: '' }); setEditingProduct(''); setProductModalOpen(true); setToast(''); setPendingBarcode(''); }}>Cargar producto</button>}</div>}

      {labelsOpen && <Labels products={products} />}
      {combosOpen && <Combos products={products} onSaved={async () => { const response = await fetch('/api/combos/public'); const data = await response.json().catch(() => null); if (Array.isArray(data)) setCombos(data); }} />}
      {reportsOpen && <Reports products={products} />}
      {usersOpen && <Users currentUser={currentUser} />}
      {inventoryOpen && <Inventory products={products} onUpdated={async () => { const response = await fetch('/api/products'); const data = await response.json().catch(() => null); if (Array.isArray(data)) setProducts(data); }} />}
      {ordersOpen && <Orders />}
      {customersOpen && <Customers />}

      {productsOpen && !combosOpen && <main className="products-page">
        <section className="products-modal" aria-labelledby="products-title">
          <div className="modal-heading"><div><h2 id="products-title">Productos</h2><p>Administrá el catálogo o agregá un producto.</p></div><button className="modal-close" type="button" onClick={() => { setProductsOpen(false); resetProductForm(); focusScanner(); }} aria-label="Cerrar"><X size={20} /></button></div>
          {!connected && <div className="catalog-warning">MongoDB no está conectado. Los cambios requieren conexión y no se guardarán en modo de prueba.</div>}
          <div className="product-overview" aria-label="Resumen del inventario">
            <div><span>Productos cargados</span><strong>{products.length}</strong></div>
            <div><span>Unidades en stock</span><strong>{stockUnitCount}</strong></div>
            <div><span>Stock bajo el mínimo</span><strong>{lowStockCount}</strong></div>
            <div><span>Unidades faltantes</span><strong>{stockDeficitCount}</strong></div>
            <div><span>Sin configurar</span><strong>{untrackedStockCount}</strong></div>
          </div>
          {untrackedStockCount > 0 && <p className="stock-untracked-note">Los productos sin configurar siguen vendiéndose, pero sus ventas no descuentan stock hasta que cargues sus existencias.</p>}
          <div className="product-admin-tabs" role="tablist" aria-label="Sección de productos">
            <button type="button" role="tab" aria-selected={productAdminTab === 'catalog'} className={productAdminTab === 'catalog' ? 'active' : ''} onClick={() => { setProductAdminTab('catalog'); resetProductForm(); }}>Catálogo</button>
            <button type="button" className="product-tab-add" onClick={() => { resetProductForm(); setProductModalOpen(true); }}>Agregar producto</button>
            <button type="button" role="tab" aria-selected={productAdminTab === 'movements'} className={productAdminTab === 'movements' ? 'active' : ''} onClick={() => setProductAdminTab('movements')}>Movimientos</button>
            <button type="button" role="tab" aria-selected={productAdminTab === 'value-history'} className={productAdminTab === 'value-history' ? 'active' : ''} onClick={() => setProductAdminTab('value-history')}>Costos y precios</button>
          </div>
          {productAdminTab === 'add' ? <div className="product-add-section"><h3>{editingProduct ? 'Editar producto' : 'Nuevo producto'}</h3><p>Completá los datos para guardarlo en el catálogo.</p>{productFormContent}</div> : productAdminTab === 'movements' ? <div className="product-admin-list">
            <div className="admin-list-heading"><strong>Historial de inventario</strong><span>Últimos 500 movimientos</span></div>
            <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Movimiento</th><th>Cantidad</th><th>Stock final</th><th>Motivo</th></tr></thead><tbody>
              {inventoryMovements.map((movement) => <tr key={movement._id}><td data-label="Fecha">{new Date(movement.createdAt).toLocaleString('es-AR')}</td><td data-label="Producto"><strong>{movement.productName}</strong></td><td data-label="Movimiento">{movement.type === 'initial_balance' ? 'Stock inicial' : movement.type === 'purchase' ? 'Ingreso' : movement.type === 'sale' ? 'Venta' : movement.type === 'return' ? 'Devolución' : movement.type === 'loss' ? 'Pérdida' : 'Ajuste'}</td><td data-label="Cantidad">{movement.quantity > 0 ? '+' : ''}{movement.quantity}</td><td data-label="Stock final">{movement.stockAfter}</td><td data-label="Motivo">{movement.reason}</td></tr>)}
              {!loadingMovements && !inventoryMovements.length && <tr><td className="catalog-empty" colSpan="6">Todavía no hay movimientos registrados.</td></tr>}
              {loadingMovements && <tr><td className="catalog-empty" colSpan="6">Cargando historial…</td></tr>}
            </tbody></table></div>
          </div> : productAdminTab === 'value-history' ? <div className="product-admin-list">
            <div className="admin-list-heading"><strong>Historial de costos y precios</strong><span>Últimos 500 cambios</span></div>
            <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Dato</th><th>Anterior</th><th>Nuevo</th><th>Motivo</th></tr></thead><tbody>
              {valueHistory.map((entry) => <tr key={entry._id}><td data-label="Fecha">{new Date(entry.createdAt).toLocaleString('es-AR')}</td><td data-label="Producto"><strong>{entry.productName}</strong></td><td data-label="Dato">{entry.field === 'cost' ? 'Costo' : entry.field === 'additionalCost' ? 'Gastos adquisición' : 'Precio de venta'}</td><td data-label="Anterior">{entry.previousValue == null ? '—' : money(entry.previousValue)}</td><td data-label="Nuevo">{entry.nextValue == null ? 'Sin costo' : money(entry.nextValue)}</td><td data-label="Motivo">{entry.reason || '—'}</td></tr>)}
              {!loadingValueHistory && !valueHistory.length && <tr><td className="catalog-empty" colSpan="6">Todavía no hay cambios registrados.</td></tr>}
              {loadingValueHistory && <tr><td className="catalog-empty" colSpan="6">Cargando historial…</td></tr>}
            </tbody></table></div>
          </div> : <div className="product-admin-list">
            <div className="catalog-toolbar"><label className="catalog-search"><Search size={19} /><input ref={productCatalogSearchRef} value={productCatalogQuery} onChange={(event) => setProductCatalogQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Buscar por nombre o código EAN" aria-label="Buscar productos por nombre o EAN" /><button type="button" className="catalog-camera-button" onClick={() => openCamera('catalog')} aria-label="Escanear EAN con la cámara" title="Escanear EAN con la cámara"><Camera size={18} /></button></label>
              <select value={productCatalogCategory} onChange={(event) => setProductCatalogCategory(event.target.value)} aria-label="Filtrar por categoría"><option value="Todas">Todas las categorías</option>{categories.filter((item) => item !== 'Todos').map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <button type="button" className="catalog-add-button" onClick={() => { resetProductForm(); setProductAdminTab('catalog'); setProductModalOpen(true); }}><Plus size={17} /> Agregar producto</button><a className="catalog-online-preview" href="/catalogo" target="_blank" rel="noreferrer"><Globe2 size={16} /> Ver catálogo online</a>
            </div>
            <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Producto</th><th>Código EAN</th><th>Categoría</th><th>Precio</th><th>Costo y margen</th><th>Stock</th><th>Online</th><th>Acciones</th></tr></thead><tbody>
              {filteredAdminProducts.map((product) => <tr key={product._id}><td data-label="Producto"><strong>{product.name}</strong>{product.detail && <small>{product.detail}</small>}</td><td data-label="Código EAN">{product.barcode || '—'}</td><td data-label="Categoría">{product.category || 'Otros'}</td><td data-label="Precio">{money(product.price)}</td><td data-label="Costo y margen">{product.cost == null ? 'Sin costo' : <><strong>{money(product.cost + (product.additionalCost || 0))}</strong><small>Margen {product.price > 0 ? (((product.price - product.cost) / product.price) * 100).toFixed(1) : '—'}%</small></>}</td><td data-label="Stock"><span className={`stock-pill ${Number.isInteger(product.stock) && product.stock <= (product.minStock ?? 5) ? 'stock-pill-low' : ''}`}>{Number.isInteger(product.stock) ? product.stock < 0 ? `Faltante: ${Math.abs(product.stock)}` : `${product.stock} un.` : 'Sin configurar'}</span></td><td data-label="Online"><div className="online-switch-cell"><button type="button" role="switch" aria-checked={product.publishedOnline === true && (!Number.isInteger(product.stock) || product.stock > 0)} aria-label={`${product.publishedOnline ? 'Ocultar' : 'Publicar'} ${product.name} en catálogo online`} className={`online-switch ${product.publishedOnline === true && (!Number.isInteger(product.stock) || product.stock > 0) ? 'is-on' : ''}`} disabled={!connected || publicationSavingId === String(product._id) || (Number.isInteger(product.stock) && product.stock <= 0)} onClick={() => toggleOnlinePublication(product)}><span /></button><span className={`online-state ${product.publishedOnline && (!Number.isInteger(product.stock) || product.stock > 0) ? 'online' : 'offline'}`}>{Number.isInteger(product.stock) && product.stock <= 0 ? 'Sin stock' : product.publishedOnline ? 'Publicado' : 'Oculto'}</span></div></td><td data-label="Acciones"><div className="catalog-actions"><button type="button" className="stock-add-action" disabled={!connected} onClick={() => { setStockReceiptProduct(product); setStockReceiptQuantity(''); setStockReceiptReason(''); setStockMovementType('purchase'); }} aria-label={`Ingresar mercadería para ${product.name}`} title="Ingresar mercadería"><PackagePlus size={16} /></button><button type="button" disabled={!connected} onClick={() => startEditing(product)} aria-label={`Editar ${product.name}`} title="Editar producto"><Pencil size={16} /></button><button className="admin-delete" type="button" disabled={!connected} onClick={() => archiveProduct(product)} aria-label={`Eliminar ${product.name}`} title="Eliminar producto"><Trash2 size={16} /></button></div></td></tr>)}
              {!filteredAdminProducts.length && <tr><td className="catalog-empty" colSpan="8">No hay productos que coincidan con la búsqueda.</td></tr>}
            </tbody></table></div>
            <div className="catalog-count">Mostrando {filteredAdminProducts.length} de {products.length} productos · {stockUnitCount} unidades registradas en stock</div>
          </div>}
        </section>
      </main>}

      {productModalOpen && <div className="modal-backdrop product-entry-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingProduct) { setProductModalOpen(false); resetProductForm(); } }}>
        <section className="products-modal product-entry-modal" role="dialog" aria-modal="true" aria-labelledby="product-entry-title">
          <div className="modal-heading"><div><h2 id="product-entry-title">{editingProduct ? 'Editar producto' : 'Agregar producto'}</h2><p>{editingProduct ? 'Actualizá los datos del producto.' : 'Completá los datos para incorporarlo al catálogo.'}</p></div><button className="modal-close" type="button" onClick={() => { setProductModalOpen(false); resetProductForm(); }} aria-label="Cerrar"><X size={20} /></button></div>
          {!connected && <div className="catalog-warning">MongoDB no está conectado. Los cambios requieren conexión para guardarse.</div>}
          {productFormContent}
        </section>
      </div>}

      {stockReceiptProduct && <div className="modal-backdrop product-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingStock) setStockReceiptProduct(null); }}>
        <section className="stock-receipt-modal" role="dialog" aria-modal="true" aria-labelledby="stock-receipt-title">
          <div className="modal-heading"><div><h2 id="stock-receipt-title">Registrar movimiento</h2><p>{stockReceiptProduct.name}</p></div><button className="modal-close" type="button" onClick={() => setStockReceiptProduct(null)} aria-label="Cerrar"><X size={20} /></button></div>
          <div className="stock-receipt-current">Stock actual <strong>{Number.isInteger(stockReceiptProduct.stock) ? stockReceiptProduct.stock < 0 ? `Faltante: ${Math.abs(stockReceiptProduct.stock)} unidades` : `${stockReceiptProduct.stock} unidades` : 'Sin configurar'}</strong></div>
          <form className="stock-receipt-form" onSubmit={receiveStock}>
            <label htmlFor="stock-movement-type">Tipo de movimiento</label>
            <select id="stock-movement-type" value={stockMovementType} onChange={(event) => setStockMovementType(event.target.value)}>
              <option value="purchase">Ingreso de mercadería</option><option value="return">Devolución</option><option value="loss">Pérdida o merma</option>
            </select>
            <label htmlFor="stock-receipt-quantity">{stockMovementType === 'loss' ? 'Unidades perdidas' : 'Unidades ingresadas'}</label>
            <input id="stock-receipt-quantity" required type="number" min="1" max="10000000" step="1" inputMode="numeric" autoFocus value={stockReceiptQuantity} onChange={(event) => setStockReceiptQuantity(event.target.value)} placeholder="Ej.: 12" />
            <label htmlFor="stock-receipt-reason">Motivo</label>
            <input id="stock-receipt-reason" required maxLength="240" value={stockReceiptReason} onChange={(event) => setStockReceiptReason(event.target.value)} placeholder={stockMovementType === 'purchase' ? 'Ej.: compra a proveedor' : stockMovementType === 'return' ? 'Ej.: devolución de cliente' : 'Ej.: producto vencido'} />
            <p>{stockMovementType === 'loss' ? 'La pérdida se descuenta del stock y no puede superar las unidades disponibles.' : 'El movimiento suma unidades y queda registrado en el historial.'}</p>
            <button className="confirm-payment" type="submit" disabled={savingStock || !connected}><PackagePlus size={18} />{savingStock ? 'Actualizando…' : stockMovementType === 'loss' ? 'Registrar pérdida' : stockMovementType === 'return' ? 'Registrar devolución' : 'Sumar al stock'}</button>
            <button className="back-to-sale" type="button" onClick={() => setStockReceiptProduct(null)}>Cancelar</button>
          </form>
        </section>
      </div>}

      {stockWarningOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setStockWarningOpen(false); }}>
        <section className="payment-modal stock-override-modal" role="alertdialog" aria-modal="true" aria-labelledby="stock-warning-title" aria-describedby="stock-warning-description">
          <div className="modal-heading"><div><h2 id="stock-warning-title">Venta sin stock suficiente</h2><p id="stock-warning-description">Podés continuar y registrar el faltante en el inventario.</p></div><button className="modal-close" type="button" onClick={() => setStockWarningOpen(false)} aria-label="Volver al carrito"><X size={20} /></button></div>
          <ul className="stock-override-list">{stockShortages.map((item) => <li key={item.name}><strong>{item.name}</strong><span>Disponibles: {Math.max(0, item.available)} · A vender: {item.quantity} · Quedará faltante: {item.deficit}</span></li>)}</ul>
          <p className="stock-override-note">Al confirmar, el stock quedará negativo hasta que ingreses mercadería.</p>
          <button className="confirm-payment" type="button" onClick={requestStockOverride}><BadgeCheck size={19} />Aceptar y continuar</button>
          <button className="back-to-sale" type="button" onClick={() => setStockWarningOpen(false)}>Volver al carrito</button>
        </section>
      </div>}

      {paymentOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePayment(); }}>
        <section className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title">
          <div className="modal-heading"><div><h2 id="payment-title">Cobrar venta</h2><p>Elegí cómo paga el cliente.</p></div><button className="modal-close" type="button" onClick={closePayment} aria-label="Cerrar"><X size={20} /></button></div>
          <div className="payment-total"><span>Total de la compra</span><strong>{money(total)}</strong></div>
          <div className="payment-options">
            {[
              ['Efectivo', Banknote], ['Mercado Pago / QR', QrCode], ['Débito', CreditCard], ['Crédito', CreditCard],
            ].map(([method, Icon]) => <button key={method} type="button" className={`payment-option ${paymentMethod === method ? 'active' : ''}`} onClick={() => setPaymentMethod(method)}><Icon size={19} />{method}{paymentMethod === method && <Check className="payment-check" size={17} />}</button>)}
          </div>
          {paymentMethod === 'Efectivo' && <div className="cash-field"><label htmlFor="cash-paid">Recibido</label><div className="cash-input-wrap"><span>$</span><input id="cash-paid" inputMode="decimal" type="number" min={total} value={paid} onChange={(event) => setPaid(event.target.value)} autoFocus /></div><div className={`change-line ${Number(paid) < total ? 'needs-more' : ''}`}><span>{Number(paid) < total ? 'Falta' : 'Vuelto'}</span><strong>{money(Math.abs((Number(paid) || 0) - total))}</strong></div><div className="quick-cash">{[total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000].filter((value, index, values) => values.indexOf(value) === index).map((value) => <button type="button" key={value} onClick={() => setPaid(String(value))}>{value === total ? 'Monto exacto' : money(value)}</button>)}</div></div>}
          <button className="confirm-payment" type="button" onClick={finishSale} disabled={busy || (paymentMethod === 'Efectivo' && Number(paid) < total)}><BadgeCheck size={19} />{busy ? 'Guardando…' : 'Confirmar y terminar'}</button>
          <button className="back-to-sale" type="button" onClick={closePayment}><ChevronDown size={16} /> Volver a la venta</button>
        </section>
      </div>}
    </div>
  );
}
