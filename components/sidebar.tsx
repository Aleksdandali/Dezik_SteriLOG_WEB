'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderOpen,
  Users,
  LogOut,
  Factory,
  Truck,
  Warehouse,
  ClipboardList,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const navigation = [
  {
    title: null,
    items: [
      { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'ОПЕРАЦІЇ',
    items: [
      { name: 'Виробництво', href: '/ops/production', icon: Factory },
      { name: 'Переміщення', href: '/ops/movements', icon: Truck },
      { name: 'Склад', href: '/ops/stock', icon: Warehouse },
      { name: 'Витрати', href: '/ops/expenses', icon: ClipboardList },
    ],
  },
  {
    title: 'ЗАМОВЛЕННЯ',
    items: [
      { name: 'Замовлення', href: '/orders', icon: ShoppingCart },
    ],
  },
  {
    title: 'КАТАЛОГ',
    items: [
      { name: 'Товари', href: '/products', icon: Package },
      { name: 'Категорії', href: '/categories', icon: FolderOpen },
    ],
  },
  {
    title: 'КЛІЄНТИ',
    items: [
      { name: 'Користувачі', href: '/users', icon: Users },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-[#FAFBFC] dark:bg-[#363f75]">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold shadow-[0_2px_6px_rgba(75,86,158,0.3)]">
          D
        </div>
        <span className="text-lg font-semibold text-foreground">DEZIK Admin</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navigation.map((group, groupIdx) => (
          <div key={groupIdx} className="mb-4">
            {group.title && (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.5px] text-[#9CA3AF]">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-white shadow-[0_2px_8px_rgba(75,86,158,0.25)]'
                      : 'text-[#6B7280] hover:bg-[#eceef5] hover:text-[#363f75] dark:text-[#9CA3AF] dark:hover:bg-[#4b569e] dark:hover:text-white'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[#6B7280] transition-colors hover:bg-[#eceef5] hover:text-[#363f75] dark:text-[#9CA3AF] dark:hover:bg-[#4b569e] dark:hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Вийти
        </button>
      </div>
    </aside>
  );
}
