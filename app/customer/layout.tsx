import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Dezik — Мої замовлення',
  description: 'Перевірте статус замовлення Dezik',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script src="https://telegram.org/js/telegram-web-app.js" />
      {/* Splash screen */}
      <div id="splash" style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'opacity 0.3s ease',
      }}>
        <img src="/logo.svg" alt="Dezik" style={{ width: 220, height: 'auto' }} />
      </div>
      <script dangerouslySetInnerHTML={{ __html: `
        window.addEventListener('load', function() {
          setTimeout(function() {
            var s = document.getElementById('splash');
            if (s) { s.style.opacity = '0'; setTimeout(function() { s.remove(); }, 300); }
          }, 600);
        });
      `}} />
      <div className="min-h-screen bg-[var(--tg-theme-bg-color,#FFFFFF)] text-[var(--tg-theme-text-color,#111827)]"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {children}
      </div>
    </>
  );
}
