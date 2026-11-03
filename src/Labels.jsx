import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, ChevronRight, Download, Layers, Plus, Printer, Search, Tag, Trash2 } from 'lucide-react';
import './labels.css';

const LABELS_STORAGE_KEY = 'los-osman-label-sectors';
const normalizeSearchText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();
const matchesSearch = (query, ...values) => { const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean); const text = normalizeSearchText(values.filter(Boolean).join(' ')); return terms.every((term) => text.includes(term)); };

const money = (amount) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(amount) || 0);

export default function Labels({ products = [] }) {
  const searchRef = useRef(null);
  const sectorTabsRef = useRef(null);
  const [sectorScroll, setSectorScroll] = useState({ left: false, right: false });
  const [sectors, setSectors] = useState(() => { try { const saved = JSON.parse(window.localStorage.getItem(LABELS_STORAGE_KEY)); return Array.isArray(saved) && saved.length ? saved : [{ id: 'sector-1', name: 'Sector 1', productIds: [] }]; } catch { return [{ id: 'sector-1', name: 'Sector 1', productIds: [] }]; } });
  const [activeSectorId, setActiveSectorId] = useState('sector-1');
  const [search, setSearch] = useState('');
  const [printSectorIds, setPrintSectorIds] = useState(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Cargando sectores…');
  const activeSector = sectors.find((sector) => sector.id === activeSectorId) || sectors[0];
  const normalizedSearch = normalizeSearchText(search);
  const filteredProducts = useMemo(() => (Array.isArray(products) ? products : []).filter((product) =>
    !normalizedSearch || matchesSearch(normalizedSearch, product.name, product.barcode, product.detail, product.category)
  ).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es-AR')), [products, normalizedSearch]);
  const selectedCount = sectors.reduce((sum, sector) => sum + sector.productIds.length, 0);
  const selectedPrintSectors = printSectorIds === null ? sectors : sectors.filter((sector) => printSectorIds.includes(sector.id));
  const selectedPrintCount = selectedPrintSectors.reduce((sum, sector) => sum + sector.productIds.length, 0);
  const productById = new Map((Array.isArray(products) ? products : []).map((product) => [String(product._id), product]));
  useEffect(() => {
    let cancelled = false;
    fetch('/api/labels').then(async (response) => {
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'No se pudieron cargar los sectores.');
      return data;
    }).then((data) => {
      if (cancelled) return;
      if (data?.persisted && Array.isArray(data.sectors) && data.sectors.length) setSectors(data.sectors);
      setRemoteAvailable(true);
      setRemoteReady(true);
    }).catch(() => {
      if (cancelled) return;
      setRemoteAvailable(false);
      setRemoteReady(true);
      setSaveStatus('Sin conexión con MongoDB; se conserva una copia local');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!remoteReady || !remoteAvailable) return undefined;
    let cancelled = false;
    setSaveStatus('Guardando en MongoDB…');
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/labels', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectors }),
        });
        if (!response.ok) throw new Error('No se pudo guardar.');
        if (!cancelled) setSaveStatus('Guardado en MongoDB');
      } catch {
        if (!cancelled) setSaveStatus('Error al guardar en MongoDB; hay una copia local');
      }
    }, 500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [sectors, remoteReady, remoteAvailable]);

  useEffect(() => {
    try { window.localStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(sectors)); } catch { /* El catálogo sigue disponible si el navegador bloquea el almacenamiento local. */ }
  }, [sectors]);

  useEffect(() => {
    if (!sectors.some((sector) => sector.id === activeSectorId) && sectors[0]) setActiveSectorId(sectors[0].id);
  }, [sectors, activeSectorId]);

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) searchRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const container = sectorTabsRef.current;
    if (!container) return undefined;
    const updateScrollState = () => setSectorScroll({
      left: container.scrollLeft > 2,
      right: container.scrollLeft + container.clientWidth < container.scrollWidth - 2,
    });
    updateScrollState();
    container.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScrollState);
    observer?.observe(container);
    container.querySelectorAll('button').forEach((button) => observer?.observe(button));
    return () => {
      container.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
      observer?.disconnect();
    };
  }, [sectors.length]);

  useEffect(() => {
    const container = sectorTabsRef.current;
    const activeTab = Array.from(container?.querySelectorAll('[data-sector-id]') || []).find((tab) => tab.dataset.sectorId === activeSectorId);
    if (!container || !activeTab) return;
    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    if (tabRect.left < containerRect.left) container.scrollBy({ left: tabRect.left - containerRect.left, behavior: 'smooth' });
    else if (tabRect.right > containerRect.right) container.scrollBy({ left: tabRect.right - containerRect.right, behavior: 'smooth' });
  }, [activeSectorId, sectors.length]);

  const scrollSectors = (direction) => sectorTabsRef.current?.scrollBy({ left: direction * 180, behavior: 'smooth' });
  const togglePrintSector = (sectorId, checked) => {
    const current = printSectorIds ?? sectors.map((sector) => sector.id);
    setPrintSectorIds(checked ? Array.from(new Set([...current, sectorId])) : current.filter((id) => id !== sectorId));
  };
  const addSector = () => {
    const id = String(Date.now()) + '-' + sectors.length;
    setSectors((current) => [...current, { id, name: 'Sector ' + (current.length + 1), productIds: [] }]);
    if (printSectorIds !== null) setPrintSectorIds((current) => [...current, id]);
    setActiveSectorId(id);
  };
  const updateSectorName = (name) => setSectors((current) => current.map((sector) => sector.id === activeSectorId ? { ...sector, name } : sector));
  const removeSector = () => {
    if (sectors.length <= 1 || !window.confirm('¿Eliminar este sector y sus etiquetas?')) return;
    const remaining = sectors.filter((sector) => sector.id !== activeSectorId);
    setSectors(remaining);
    setActiveSectorId(remaining[0].id);
  };
  const toggleProduct = (productId, checked) => setSectors((current) => current.map((sector) => {
    if (sector.id !== activeSectorId) return sector;
    const productIds = checked ? Array.from(new Set([...sector.productIds, productId])) : sector.productIds.filter((id) => id !== productId);
    return { ...sector, productIds };
  }));

  const downloadPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const margin = 9;
    const gutter = 8;
    const columnWidth = (210 - margin * 2 - gutter) / 2;
    const bottom = 287;
    let column = 0;
    let y = 19;
    let renderedRows = 0;
    let rightColumnStarted = false;
    let fullWidthPage = false;
    const printableSectors = selectedPrintSectors.map((sector) => ({
      sector,
      products: sector.productIds.map((id) => productById.get(String(id))).filter(Boolean),
    })).filter(({ products }) => products.length);
    const balanceAt = Math.ceil(printableSectors.reduce((count, group) => count + group.products.length, 0) / 2);
    const columnX = () => margin + column * (columnWidth + gutter);
    const drawPageHeading = () => {
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('LOS OSMAN', margin, 10);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text('Etiquetas de precios por sector', 210 - margin, 10, { align: 'right' });
      pdf.setDrawColor(125, 125, 125);
      pdf.setLineWidth(0.3);
      pdf.line(margin, 13, 210 - margin, 13);
    };
    const nextColumn = () => {
      if (column === 0) {
        column = 1;
        rightColumnStarted = true;
        y = 19;
      } else {
        pdf.addPage('a4', 'portrait');
        column = 0;
        rightColumnStarted = false;
        y = 19;
        drawPageHeading();
      }
    };
    const measureHeight = (products, width, compact) => {
      const fontSize = compact ? 7 : 8;
      const lineHeight = compact ? 3.2 : 4;
      const rowGap = compact ? 3 : 4;
      const rowsHeight = products.reduce((sum, product) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(fontSize);
        const lines = pdf.splitTextToSize(product.name, width - 32);
        return sum + Math.max(compact ? 5 : 6, lines.length * lineHeight) + rowGap;
      }, 0);
      return 15 + rowsHeight;
    };
    const drawSector = (sector, products, x, width, compact) => {
      const fontSize = compact ? 7 : 8;
      const lineHeight = compact ? 3.2 : 4;
      const rowGap = compact ? 3 : 4;
      const rows = products.map((product) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(fontSize);
        const nameLines = pdf.splitTextToSize(product.name, width - 32);
        const rowHeight = Math.max(compact ? 5 : 6, nameLines.length * lineHeight);
        return { product, nameLines, rowHeight };
      });
      const startY = y;
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(sector.name || 'Sector sin nombre', x + 3, y + 5);
      pdf.setDrawColor(120, 120, 120);
      pdf.setLineWidth(0.25);
      pdf.line(x + 3, y + 8, x + width - 3, y + 8);
      y += 11;
      rows.forEach(({ product, nameLines, rowHeight }) => {
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(fontSize);
        const textOffset = (rowHeight - (nameLines.length - 1) * lineHeight) / 2 + 0.5;
        pdf.text(nameLines, x + 3, y + textOffset);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(compact ? 8 : 9);
        const priceOffset = textOffset + ((nameLines.length - 1) * lineHeight) / 2;
        pdf.text(money(product.price), x + width - 3, y + priceOffset, { align: 'right' });
        pdf.setDrawColor(195, 200, 205);
        pdf.setLineWidth(0.2);
        pdf.line(x + 3, y + rowHeight + 1, x + width - 3, y + rowHeight + 1);
        y += rowHeight + rowGap;
      });
      const height = y - startY + 1.5;
      pdf.setDrawColor(115, 125, 135);
      pdf.setLineWidth(0.35);
      pdf.rect(x, startY, width, height);
      pdf.setLineWidth(0.2);
      y = startY + height + 4;
      renderedRows += products.length;
    };

    pdf.setProperties({ title: 'Etiquetas de precios - LOS OSMAN', subject: 'Listas de precios por sector' });
    drawPageHeading();
    printableSectors.forEach(({ sector, products }) => {
      if (fullWidthPage) {
        pdf.addPage('a4', 'portrait');
        column = 0;
        rightColumnStarted = false;
        y = 19;
        fullWidthPage = false;
        drawPageHeading();
      }
      const currentDistance = Math.abs(renderedRows - balanceAt);
      const distanceAfterSector = Math.abs(renderedRows + products.length - balanceAt);
      const placeInRightColumn = renderedRows > 0 && distanceAfterSector >= currentDistance;
      if (!rightColumnStarted && column === 0 && (renderedRows >= balanceAt || placeInRightColumn)) nextColumn();

      let width = columnWidth;
      let x = columnX();
      let compact = false;
      let blockHeight = measureHeight(products, width, compact);
      if (blockHeight > bottom - 19) {
        width = 210 - margin * 2;
        x = margin;
        compact = true;
        blockHeight = measureHeight(products, width, compact);
        if (y > 19 || column !== 0) {
          pdf.addPage('a4', 'portrait');
          column = 0;
          rightColumnStarted = false;
          y = 19;
          drawPageHeading();
        }
        fullWidthPage = true;
      }
      if (!fullWidthPage && y + blockHeight > bottom) nextColumn();
      if (!fullWidthPage) x = columnX();
      drawSector(sector, products, x, width, compact);
    });
    pdf.save('los-osman-etiquetas.pdf');
  };

  return <main className="labels-page">
    <header className="labels-heading"><div className="labels-title-icon"><Tag size={22} /></div><div><h1>Etiquetas de precios</h1><p>Organizá productos por sector, revisá la vista previa e imprimí.</p></div></header>
    <div className="labels-workspace">
      <section className="labels-builder" aria-label="Configuración de etiquetas">
        <div className="labels-panel-heading"><div><Layers size={18} /><h2>Sectores y productos</h2></div><span>{selectedCount} etiquetas</span></div>
        <div className="sector-carousel" aria-label="Navegación de sectores">
          <button className="sector-scroll-arrow" type="button" onClick={() => scrollSectors(-1)} disabled={!sectorScroll.left} aria-label="Desplazar sectores a la izquierda"><ChevronLeft size={18} /></button>
          <div className="sector-tabs" ref={sectorTabsRef} aria-label="Sectores">{sectors.map((sector) => <button type="button" data-sector-id={sector.id} key={sector.id} className={sector.id === activeSectorId ? 'active' : ''} onClick={() => setActiveSectorId(sector.id)}>{sector.name || 'Sector sin nombre'} <span>{sector.productIds.length}</span></button>)}<button type="button" className="sector-add" onClick={addSector} aria-label="Agregar sector"><Plus size={17} /></button></div>
          <button className="sector-scroll-arrow" type="button" onClick={() => scrollSectors(1)} disabled={!sectorScroll.right} aria-label="Desplazar sectores a la derecha"><ChevronRight size={18} /></button>
        </div>
        <p className="labels-autosave-note" role="status">{saveStatus}</p><div className="sector-print-options" aria-label="Sectores a imprimir"><strong>Elegí los sectores para imprimir</strong>{sectors.map((sector) => <label key={sector.id}><input type="checkbox" checked={printSectorIds === null || printSectorIds.includes(sector.id)} onChange={(event) => togglePrintSector(sector.id, event.target.checked)} />{sector.name || "Sector sin nombre"}</label>)}</div><div className="sector-name-row"><label htmlFor="label-sector-name">Nombre del sector</label><div><input id="label-sector-name" value={activeSector.name} onChange={(event) => updateSectorName(event.target.value)} maxLength="40" placeholder="Ej.: Yerbas y edulcorantes" /><button type="button" onClick={removeSector} disabled={sectors.length <= 1} aria-label="Eliminar sector" title="Eliminar sector"><Trash2 size={17} /></button></div></div>
        <label className="label-product-search"><Search size={18} /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Buscá por nombre o escaneá un EAN" aria-label="Buscar por nombre o código EAN" /><span>USB</span></label>
        <p className="label-scanner-hint"><Camera size={14} /> El lector USB escribe el código en el buscador. Marcá los productos que quieras incluir en este sector.</p>
        <div className="label-product-list">{filteredProducts.map((product) => {
          const checked = activeSector.productIds.includes(String(product._id));
          return <label className="label-product-option" key={product._id}><input type="checkbox" checked={checked} onChange={(event) => toggleProduct(String(product._id), event.target.checked)} /><span className="label-check-visual"><Check size={13} /></span><span className="label-product-info"><strong>{product.name}</strong><small>{product.barcode || 'Sin código EAN'} · {product.category || 'Otros'}</small></span><strong className="label-product-price">{money(product.price)}</strong></label>;
        })}{!filteredProducts.length && <div className="labels-empty">No hay productos que coincidan con la búsqueda.</div>}</div>
      </section>
      <section className="labels-preview-panel" aria-label="Vista previa de impresión">
        <div className="labels-panel-heading"><div><Printer size={18} /><h2>Vista previa</h2></div><div className="labels-actions"><button type="button" className="labels-pdf-button" onClick={downloadPdf} disabled={!selectedPrintCount}><Download size={16} /> Descargar PDF</button><button type="button" className="labels-print-button" onClick={() => window.print()} disabled={!selectedPrintCount}><Printer size={16} /> Imprimir</button></div></div>
        <div className="labels-preview-summary">{selectedPrintCount ? selectedPrintCount + ' etiquetas · ' + selectedPrintSectors.filter((sector) => sector.productIds.length).length + ' sectores elegidos' : 'Marcá uno o más sectores para imprimir'}</div>
        <div className="labels-print-area"><div className="labels-print-heading"><strong>LOS OSMAN</strong><span>Lista de precios por sector</span></div>
          {selectedPrintSectors.filter((sector) => sector.productIds.length).map((sector) => <section className="label-preview-sector" key={sector.id}><h3>{sector.name || 'Sector sin nombre'}</h3><div className="label-preview-grid">{sector.productIds.map((id) => {
            const product = productById.get(id);
            return product && <article className="price-label" key={id}><span className="price-label-name">{product.name}</span>{product.detail && <small>{product.detail}</small>}<strong>{money(product.price)}</strong></article>;
          })}</div></section>)}
          {!selectedPrintCount && <div className="labels-preview-empty"><Tag size={26} /><span>La vista previa aparecerá acá</span><small>Elegí uno o más productos del sector.</small></div>}
        </div>
        <p className="labels-print-note">El PDF se descarga directamente en A4 y dos columnas. Imprimir abre el diálogo de impresión por separado.</p>
      </section>
    </div>
  </main>;
}
