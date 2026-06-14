import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapPin } from "lucide-react";

interface ILocationMapProps {
  lat?: number;
  lng?: number;
  location: string;
}

export function LocationMap({ lat, lng, location }: ILocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if (lat === undefined || lng === undefined) return;

    delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: markerIcon2x,
      iconUrl: markerIcon,
      shadowUrl: markerShadow,
    });

    const map = L.map(mapRef.current, {
      center: [lat, lng],
      zoom: 15,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    L.marker([lat, lng]).addTo(map).bindPopup(location);

    requestAnimationFrame(() => {
      map.invalidateSize();
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [lat, lng, location]);

  if (lat === undefined || lng === undefined) {
    return (
      <div
        data-testid="contact-map"
        className="aspect-[4/3] bg-primary-50 rounded-2xl flex items-center justify-center"
      >
        <div className="text-center" aria-hidden="true">
          <MapPin className="w-12 h-12 text-primary-400 mx-auto mb-3" />
          <p className="font-body text-primary-700">{location}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      data-testid="contact-map"
      className="aspect-[4/3] rounded-2xl overflow-hidden"
      role="img"
      aria-label={`Map showing location: ${location}`}
    />
  );
}
