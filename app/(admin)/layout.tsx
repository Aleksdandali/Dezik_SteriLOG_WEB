import { Sidebar } from '@/components/sidebar';

// Без цього Next пререндерить клієнтські сторінки на build і викличе createClient()
// до того, як на Vercel задані NEXT_PUBLIC_* — збірка падає.
export const dynamic = 'force-dynamic';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-[#f8fafc]">
        <div className="px-8 py-6">{children}</div>
      </main>
    </div>
  );
}
