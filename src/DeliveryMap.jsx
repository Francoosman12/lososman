import { useEffect, useRef } from 'react';
import L from 'leaflet';

export default function DeliveryMap({ center, radius, marker, onSelect, selectionLabel = 'Ubicación seleccionada' }) {
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const circleRef = useRef(null);
  const storeMarkerRef = useRef(null);
  const selectedMarkerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return undefined;
    const map = L.map(elementRef.current, { scrollWheelZoom: false }).setView([center.latitude, center.longitude], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on('click', (event) => onSelectRef.current?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
    mapRef.current = map;
    window.requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapRef.current = null;
      circleRef.current = null;
      storeMarkerRef.current = null;
      selectedMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const storePosition = [center.latitude, center.longitude];
    if (!storeMarkerRef.current) {
      storeMarkerRef.current = L.circleMarker(storePosition, {
        radius: 7, color: '#ffffff', weight: 2, fillColor: '#08783d', fillOpacity: 1,
      }).bindTooltip('Local').addTo(map);
    } else {
      storeMarkerRef.current.setLatLng(storePosition);
    }
    if (!circleRef.current) {
      circleRef.current = L.circle(storePosition, {
        radius, color: '#08783d', weight: 2, fillColor: '#08783d', fillOpacity: 0.1,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(storePosition).setRadius(radius);
    }
    if (marker && Number.isFinite(marker.latitude) && Number.isFinite(marker.longitude)) {
      const position = [marker.latitude, marker.longitude];
      if (!selectedMarkerRef.current) {
        selectedMarkerRef.current = L.circleMarker(position, {
          radius: 7, color: '#ffffff', weight: 2, fillColor: '#dc4c42', fillOpacity: 1,
        }).bindTooltip(selectionLabel).addTo(map);
      } else {
        selectedMarkerRef.current.setLatLng(position);
      }
      map.panTo(position);
    } else if (selectedMarkerRef.current) {
      selectedMarkerRef.current.remove();
      selectedMarkerRef.current = null;
    }
  }, [center.latitude, center.longitude, radius, marker?.latitude, marker?.longitude, selectionLabel]);

  return <div className={`delivery-map ${onSelect ? 'delivery-map-selectable' : ''}`} ref={elementRef} role="application" aria-label="Mapa del área de entrega" />;
}
