import { useState } from 'react';
import { useSiteSettings, digitsOnly } from '../hooks/useSiteSettings';

export default function WhatsAppFloat() {
  const [hovered, setHovered] = useState(false);
  const { supportWhatsapp } = useSiteSettings();
  const phoneNumber = digitsOnly(supportWhatsapp); // admin-set WhatsApp number (no hard-coding)
  const message = encodeURIComponent('Hi! I have a question about DhanFunded.');
  const href = `https://wa.me/${phoneNumber}?text=${message}`;

  // No number set in Admin → Settings: no button, rather than a dead wa.me link.
  if (!phoneNumber) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fixed bottom-5 right-5 sm:bottom-7 sm:right-7 z-50 flex items-center gap-3 group"
      aria-label="Chat with us on WhatsApp"
    >
      {/* Tooltip label */}
      <span
        className={`hidden sm:block px-4 py-2 rounded-full bg-[#0A2130] text-white text-sm font-medium shadow-lg transition-all duration-300 ${
          hovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-3 pointer-events-none'
        }`}
      >
        Chat on WhatsApp
      </span>

      {/* Pulse ring */}
      <span className="absolute right-0 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#25D366] opacity-50 animate-ping" />

      {/* Button */}
      <span className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#25D366] hover:bg-[#1faa54] flex items-center justify-center shadow-[0_8px_24px_rgba(37,211,102,0.4)] transition-all duration-200 group-hover:scale-110">
        <svg viewBox="0 0 32 32" className="w-7 h-7 sm:w-8 sm:h-8 fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.001 3.2c-7.07 0-12.8 5.73-12.8 12.8 0 2.27.6 4.42 1.65 6.27L3.2 28.8l6.7-1.62c1.78.97 3.81 1.49 5.97 1.49h.01c7.07 0 12.8-5.73 12.8-12.8 0-3.42-1.33-6.63-3.75-9.05a12.74 12.74 0 0 0-9.04-3.62zm0 23.31h-.01a10.5 10.5 0 0 1-5.34-1.46l-.38-.23-3.97.96 1.06-3.87-.25-.4a10.49 10.49 0 0 1-1.61-5.6c0-5.8 4.72-10.51 10.52-10.51 2.81 0 5.45 1.09 7.43 3.08a10.43 10.43 0 0 1 3.07 7.43c0 5.8-4.72 10.6-10.52 10.6zm5.78-7.87c-.32-.16-1.87-.92-2.16-1.03-.29-.11-.5-.16-.71.16-.21.32-.81 1.03-.99 1.24-.18.21-.36.24-.68.08-.32-.16-1.34-.49-2.55-1.57-.94-.84-1.58-1.88-1.76-2.2-.18-.32-.02-.49.14-.65.14-.14.32-.36.48-.55.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54-.18-.01-.4-.01-.62-.01-.21 0-.55.08-.84.4-.29.32-1.1 1.07-1.1 2.62 0 1.55 1.13 3.04 1.29 3.25.16.21 2.22 3.39 5.39 4.76.75.32 1.34.52 1.8.66.76.24 1.45.21 1.99.13.61-.09 1.87-.76 2.13-1.5.26-.74.26-1.37.18-1.5-.08-.13-.29-.21-.61-.37z"/>
        </svg>
      </span>
    </a>
  );
}
