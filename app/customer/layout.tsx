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
};

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script src="https://telegram.org/js/telegram-web-app.js" />
      <div className="min-h-screen bg-[var(--tg-theme-bg-color,#FFFFFF)] text-[var(--tg-theme-text-color,#111827)]">
        {children}
      </div>
    </>
  );
}
