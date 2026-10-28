import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Download, Layers, Plus, Printer, Search, Tag, Trash2 } from 'lucide-react';
import './labels.css';

const money = (amount) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(amount) || 0);

export default function Labels({ products = [] }) {
  const searchRef = useRef(null);
  const [sectors, setSectors] = useState([{ id: 'sector-1', name: 'Sector 1', productIds: [] }]);
  const [activeSectorId, setActiveSectorId] = useState('sector-1');
  const [search, setSearch] = useState('');
  const activeSector = sectors.find((sector) => sector.id === activeSectorId) || sectors[0];
  const normalizedSearch = search.trim().toLocaleLowerCase('es-AR');
  const filteredProducts = useMemo(() => (Array.isArray(products) ? products : []).filter((product) =>
    !normalizedSearch || [product.name, product.barcode, product.detail, product.category].filter(Boolean).join(' ').toLocaleLowerCase('es-AR').includes(normalizedSearch)
  ).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es-AR')), [products, normalizedSearch]);
  const selectedCount = sectors.reduce((sum, sector) => sum + sector.productIds.length, 0);
  const productById = new Map((Array.isArray(products) ? products : []).map((product) => [String(product._id), product]));

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) searchRef.current?.focus({ preventScroll: true });
  }, []);

  const addSector = () => {
    const id = String(Date.now()) + '-' + sectors.length;
    setSectors((current) => [...current, { id, name: 'Sector ' + (current.length + 1), productIds: [] }]);
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
    const bottom = 288;
    let column = 0;
    let y = 20;
    let renderedRows = 0;
    let rightColumnStarted = false;
    const printableSectors = sectors.map((sector) => ({
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
      pdf.line(margin, 13, 210 - margin, 13);
    };
    const nextColumn = () => {
      if (column === 0) {
        column = 1;
        rightColumnStarted = true;
        y = 20;
      } else {
        pdf.addPage('a4', 'portrait');
        column = 0;
        y = 20;
        drawPageHeading();
      }
    };
    const drawSectorHeading = (name) => {
      if (y + 8 > bottom) nextColumn();
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(name, columnX(), y);
      pdf.setDrawColor(125, 125, 125);
      pdf.line(columnX(), y + 2, columnX() + columnWidth, y + 2);
      y += 6;
    };

    pdf.setProperties({ title: 'Etiquetas de precios - LOS OSMAN', subject: 'Listas de precios por sector' });
    drawPageHeading();
    printableSectors.forEach(({ sector, products }) => {
      const currentDistance = Math.abs(renderedRows - balanceAt);
      const distanceAfterSector = Math.abs(renderedRows + products.length - balanceAt);
      const placeSectorInRightColumn = renderedRows > 0 && distanceAfterSector >= currentDistance;
      if (!rightColumnStarted && column === 0 && (renderedRows >= balanceAt || placeSectorInRightColumn)) nextColumn();
      if (y + 8 > bottom) nextColumn();
      const sectorName = sector.name || 'Sector sin nombre';
      drawSectorHeading(sectorName);
      products.forEach((product, index) => {
        if (!rightColumnStarted && column === 0 && renderedRows >= balanceAt) {
          nextColumn();
          if (index > 0) drawSectorHeading(sectorName + ' (continuación)');
        }
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        const nameLines = pdf.splitTextToSize(product.name, columnWidth - 27);
        const rowHeight = Math.max(5, nameLines.length * 4);
        if (y + rowHeight > bottom) {
          nextColumn();
          drawSectorHeading(sectorName + ' (continuación)');
        }
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text(nameLines, columnX(), y);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.text(money(product.price), columnX() + columnWidth, y, { align: 'right' });
        pdf.setDrawColor(210, 210, 210);
        pdf.line(columnX(), y + rowHeight - 1, columnX() + columnWidth, y + rowHeight - 1);
        y += rowHeight + 1;
        renderedRows += 1;
      });
      y += 3;
    });
    pdf.save('los-osman-etiquetas.pdf');
  };

  return <main className="labels-page">
    <header className="labels-heading"><div className="labels-title-icon"><Tag size={22} /></div><div><h1>Etiquetas de precios</h1><p>Organizá productos por sector, revisá la vista previa e imprimí.</p></div></header>
    <div className="labels-workspace">
      <section className="labels-builder" aria-label="Configuración de etiquetas">
        <div className="labels-panel-heading"><div><Layers size={18} /><h2>Sectores y productos</h2></div><span>{selectedCount} etiquetas</span></div>
        <div className="sector-tabs" aria-label="Sectores">{sectors.map((sector) => <button type="button" key={sector.id} className={sector.id === activeSectorId ? 'active' : ''} onClick={() => setActiveSectorId(sector.id)}>{sector.name || 'Sector sin nombre'} <span>{sector.productIds.length}</span></button>)}<button type="button" className="sector-add" onClick={addSector} aria-label="Agregar sector"><Plus size={17} /></button></div>
        <div className="sector-name-row"><label htmlFor="label-sector-name">Nombre del sector</label><div><input id="label-sector-name" value={activeSector.name} onChange={(event) => updateSectorName(event.target.value)} maxLength="40" placeholder="Ej.: Yerbas y edulcorantes" /><button type="button" onClick={removeSector} disabled={sectors.length <= 1} aria-label="Eliminar sector" title="Eliminar sector"><Trash2 size={17} /></button></div></div>
        <label className="label-product-search"><Search size={18} /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Buscá por nombre o escaneá un EAN" aria-label="Buscar por nombre o código EAN" /><span>USB</span></label>
        <p className="label-scanner-hint"><Camera size={14} /> El lector USB escribe el código en el buscador. Marcá los productos que quieras incluir en este sector.</p>
        <div className="label-product-list">{filteredProducts.map((product) => {
          const checked = activeSector.productIds.includes(String(product._id));
          return <label className="label-product-option" key={product._id}><input type="checkbox" checked={checked} onChange={(event) => toggleProduct(String(product._id), event.target.checked)} /><span className="label-check-visual"><Check size={13} /></span><span className="label-product-info"><strong>{product.name}</strong><small>{product.barcode || 'Sin código EAN'} · {product.category || 'Otros'}</small></span><strong className="label-product-price">{money(product.price)}</strong></label>;
        })}{!filteredProducts.length && <div className="labels-empty">No hay productos que coincidan con la búsqueda.</div>}</div>
      </section>
      <section className="labels-preview-panel" aria-label="Vista previa de impresión">
        <div className="labels-panel-heading"><div><Printer size={18} /><h2>Vista previa</h2></div><div className="labels-actions"><button type="button" className="labels-pdf-button" onClick={downloadPdf} disabled={!selectedCount}><Download size={16} /> Descargar PDF</button><button type="button" className="labels-print-button" onClick={() => window.print()} disabled={!selectedCount}><Printer size={16} /> Imprimir</button></div></div>
        <div className="labels-preview-summary">{selectedCount ? selectedCount + ' etiquetas en ' + sectors.filter((sector) => sector.productIds.length).length + ' sectores' : 'Seleccioná productos para ver tus etiquetas'}</div>
        <div className="labels-print-area"><div className="labels-print-heading"><strong>LOS OSMAN</strong><span>Lista de precios por sector</span></div>
          {sectors.filter((sector) => sector.productIds.length).map((sector) => <section className="label-preview-sector" key={sector.id}><h3>{sector.name || 'Sector sin nombre'}</h3><div className="label-preview-grid">{sector.productIds.map((id) => {
            const product = productById.get(id);
            return product && <article className="price-label" key={id}><span className="price-label-name">{product.name}</span>{product.detail && <small>{product.detail}</small>}<strong>{money(product.price)}</strong></article>;
          })}</div></section>)}
          {!selectedCount && <div className="labels-preview-empty"><Tag size={26} /><span>La vista previa aparecerá acá</span><small>Elegí uno o más productos del sector.</small></div>}
        </div>
        <p className="labels-print-note">El PDF se descarga directamente en A4 y dos columnas. Imprimir abre el diálogo de impresión por separado.</p>
      </section>
    </div>
  </main>;
}
