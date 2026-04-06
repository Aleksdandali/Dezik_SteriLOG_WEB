'use client';

import { useState, useEffect, useCallback } from 'react';

interface Order {
  id: number;
  status: string;
  status_id: number;
  payment: string;
  total: number;
  date: string;
  ttn: string | null;
  np_status: string | null;
  city: string | null;
  address: string | null;
  products: { name: string; qty: number; price: number }[];
}

interface CatalogProduct {
  id: number;
  name: string;
  price: number;
  quantity: number;
  thumbnail: string | null;
  in_stock: boolean;
}

interface CartItem {
  product: CatalogProduct;
  qty: number;
}

type View = 'menu' | 'active' | 'history' | 'certificates' | 'solution' | 'order-detail' | 'shop' | 'cart' | 'checkout' | 'order-success' | 'profile' | 'ai-chat';

export default function CustomerPage() {
  const [phone, setPhone] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [catalog, setCatalog] = useState<(CatalogProduct & { category?: string })[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutName, setCheckoutName] = useState('');
  const [checkoutCity, setCheckoutCity] = useState('');
  const [checkoutCityRef, setCheckoutCityRef] = useState('');
  const [checkoutWarehouse, setCheckoutWarehouse] = useState('');
  const [checkoutWarehouseRef, setCheckoutWarehouseRef] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<{ ref: string; name: string; area: string }[]>([]);
  const [warehouseSuggestions, setWarehouseSuggestions] = useState<{ ref: string; name: string }[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [showWarehouseSuggestions, setShowWarehouseSuggestions] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [newOrderId, setNewOrderId] = useState<number | null>(null);
  const [profile, setProfile] = useState<{ name: string | null; phone: string | null; city: string | null; address: string | null } | null>(null);
  const [telegramUserId, setTelegramUserId] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ id: string; sender_type: string; text: string; created_at: string }[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<(CatalogProduct & { category?: string }) | null>(null);
  const [paymentUploading, setPaymentUploading] = useState(false);
  const [paymentSent, setPaymentSent] = useState(false);
  const [productLightbox, setProductLightbox] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [aiText, setAiText] = useState('');
  const [aiSending, setAiSending] = useState(false);

  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp: { ready: () => void; expand: () => void; initDataUnsafe?: { user?: { id: number } }; BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void } } } }).Telegram?.WebApp;
    if (tg) {
      tg.ready(); tg.expand();
      if (tg.initDataUnsafe?.user?.id) setTelegramUserId(tg.initDataUnsafe.user.id);
    }
    const saved = localStorage.getItem('dezik_phone');
    if (saved) { setPhone(saved); searchOrders(saved); }
  }, []);

  const loadChatMessages = useCallback(async (orderId: number) => {
    setChatLoading(true);
    try {
      const res = await fetch(`/api/customer/messages?order_id=${orderId}`);
      const data = await res.json();
      setChatMessages(data.data ?? []);
    } catch {} finally { setChatLoading(false); }
  }, []);

  const sendChatMessage = async (orderId: number) => {
    if (!chatText.trim()) return;
    setChatSending(true);
    try {
      await fetch('/api/customer/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          sender_type: 'customer',
          sender_telegram_id: telegramUserId,
          text: chatText.trim(),
        }),
      });
      setChatText('');
      loadChatMessages(orderId);
    } catch {} finally { setChatSending(false); }
  };

  // Back button
  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp: { BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void } } } }).Telegram?.WebApp;
    if (!tg) return;
    const handleBack = () => {
      if (chatOpen) { setChatOpen(false); }
      else if (viewingOrder) { setViewingOrder(null); setChatOpen(false); setView('active'); }
      else if (viewingProduct) { setViewingProduct(null); }
      else if (view === 'ai-chat') { setView('menu'); setAiMessages([]); setAiText(''); }
      else if (view !== 'menu') setView('menu');
    };
    if (view !== 'menu' || viewingOrder || chatOpen || viewingProduct) { tg.BackButton.show(); tg.BackButton.onClick(handleBack); }
    else { tg.BackButton.hide(); }
    return () => { tg.BackButton.offClick(handleBack); };
  }, [view, viewingOrder, chatOpen, viewingProduct]);

  const searchOrders = async (p: string) => {
    if (p.length < 9) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/customer/orders?phone=${encodeURIComponent(p)}`);
      const data = await res.json();
      if ((data.data ?? []).length > 0) {
        setOrders(data.data);
        setAuthorized(true);
        localStorage.setItem('dezik_phone', p);
        if (data.profile) {
          setProfile(data.profile);
          setCheckoutName(data.profile.name ?? '');
          setCheckoutCity(data.profile.city ?? '');
          setCheckoutWarehouse(data.profile.address ?? '');
        }
      } else if (p.length >= 9) {
        // No orders but phone is valid — still allow access for shopping
        setAuthorized(true);
        localStorage.setItem('dezik_phone', p);
      }
    } catch {} finally { setLoading(false); }
  };

  const logout = () => {
    localStorage.removeItem('dezik_phone');
    setAuthorized(false);
    setOrders([]);
    setPhone('');
    setView('menu');
  };

  const searchCity = async (q: string) => {
    setCheckoutCity(q);
    setShowCitySuggestions(true);
    if (q.length < 2) { setCitySuggestions([]); return; }
    try {
      const res = await fetch(`/api/customer/np-search?type=city&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setCitySuggestions(data.data ?? []);
    } catch { setCitySuggestions([]); }
  };

  const selectCity = (city: { ref: string; name: string; area: string }) => {
    setCheckoutCity(city.name);
    setCheckoutCityRef(city.ref);
    setShowCitySuggestions(false);
    setCitySuggestions([]);
    setCheckoutWarehouse('');
    setCheckoutWarehouseRef('');
    // Load warehouses
    loadWarehouses(city.ref, '');
  };

  const loadWarehouses = async (cityRef: string, q: string) => {
    try {
      const res = await fetch(`/api/customer/np-search?type=warehouse&city_ref=${cityRef}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setWarehouseSuggestions(data.data ?? []);
      setShowWarehouseSuggestions(true);
    } catch { setWarehouseSuggestions([]); }
  };

  const searchWarehouse = async (q: string) => {
    setCheckoutWarehouse(q);
    setShowWarehouseSuggestions(true);
    if (checkoutCityRef) loadWarehouses(checkoutCityRef, q);
  };

  const selectWarehouse = (wh: { ref: string; name: string }) => {
    setCheckoutWarehouse(wh.name);
    setCheckoutWarehouseRef(wh.ref);
    setShowWarehouseSuggestions(false);
    setWarehouseSuggestions([]);
  };

  const loadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch('/api/customer/catalog');
      const data = await res.json();
      setCatalog(data.data ?? []);
      setCatalogCategories(data.categories ?? []);
    } catch {} finally { setCatalogLoading(false); }
  };

  const addToCart = (product: CatalogProduct) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateCartQty = (productId: number, qty: number) => {
    if (qty <= 0) setCart(prev => prev.filter(i => i.product.id !== productId));
    else setCart(prev => prev.map(i => i.product.id === productId ? { ...i, qty } : i));
  };

  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const submitOrder = async () => {
    if (!checkoutName || cart.length === 0) return;
    setOrdering(true);
    try {
      const res = await fetch('/api/customer/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: `380${phone}`,
          name: checkoutName,
          city_name: checkoutCity,
          warehouse_name: checkoutWarehouse,
          warehouse_ref: checkoutWarehouseRef || undefined,
          products: cart.map(i => ({ name: i.product.name, quantity: i.qty, price: i.product.price, sku: '' })),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewOrderId(data.order_id);
        setView('order-success');
        setCart([]);
      } else {
        alert(data.error ?? 'Помилка');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally { setOrdering(false); }
  };

  const statusIcon = (id: number) => {
    if (id === 12) return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
    if (id === 8) return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    );
    if (id === 19) return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
    if (id === 4 || id === 10) return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    );
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  };
  const statusStyle = (id: number) => {
    if (id === 12) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
    if (id === 8) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    if (id === 19) return { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' };
    if (id === 4 || id === 10) return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' };
    return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
  };

  const getProductDescription = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes('пакет')) return 'Самоклеючі пакети для парової та газової стерилізації з індикаторами. Щільний медичний папір та прозора плівка.';
    if (lower.includes('деланол') || lower.includes('delanol')) return 'Засіб для дезінфекції, передстерилізаційної очистки та стерилізації інструментів. Готовий до використання.';
    if (lower.includes('біонол') || lower.includes('bionol')) return 'Засіб для дезінфекції інструментів та передстерилізаційної очистки. Ефективний проти бактерій, вірусів та грибків.';
    if (lower.includes('інструм') || lower.includes('instrum')) return 'Професійний засіб для очищення інструментів від нагару, іржі та забруднень.';
    if (lower.includes('контейнер')) return 'Ємність для замочування та дезінфекції інструментів. Зручна кришка з фіксатором.';
    if (lower.includes('антисептик') || lower.includes('септональ')) return 'Антисептичний засіб для обробки рук. Містить зволожуючі компоненти.';
    if (lower.includes('бокс') || lower.includes('box')) return 'Готовий набір для стерилізації. Все необхідне в одній коробці.';
    if (lower.includes('набор пилка') || lower.includes('набір пилка') || lower.includes('пилка+баф') || lower.includes('пилка + баф')) return 'Одноразовий набір для манікюру.';
    return 'Професійна продукція Dezik для салонів краси.';
  };

  const activeOrders = orders.filter(o => [1, 4, 8, 10].includes(o.status_id));
  const historyOrders = orders.filter(o => [12, 19].includes(o.status_id));

  // ═══════════════════════════════════
  // Login
  // ═══════════════════════════════════
  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-md mx-auto w-full">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-[#4b569e] to-[#363f75] flex items-center justify-center text-white font-bold text-3xl shadow-xl shadow-[#4b569e]/25">
            D
          </div>
          <h1 className="text-[26px] font-bold text-[#111827] mt-5">Dezik</h1>
          <p className="text-[15px] text-[#9CA3AF] mt-2 text-center leading-relaxed">
            Введіть номер телефону<br/>щоб увійти в кабінет
          </p>

          <div className="w-full mt-8 space-y-4">
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[16px] text-[#9CA3AF] font-medium">+380</span>
              <input type="tel" inputMode="tel" placeholder="XX XXX XX XX" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && searchOrders(phone)}
                autoFocus
                className="w-full h-[56px] pl-[76px] pr-5 rounded-2xl border-2 border-[#E5E7EB] bg-white text-[#111827] text-[18px] font-medium
                  placeholder:text-[#9CA3AF] focus:border-[#4b569e] focus:outline-none transition-all" />
            </div>
            <button onClick={() => searchOrders(phone)} disabled={phone.length < 9 || loading}
              className="w-full py-4 rounded-2xl bg-gradient-to-b from-[#4b569e] to-[#363f75] text-white text-[16px] font-bold
                shadow-lg shadow-[#4b569e]/25 active:scale-[0.97] transition-all disabled:opacity-40">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Шукаємо...
                </span>
              ) : 'Увійти'}
            </button>
          </div>
        </div>
        <div className="text-center py-6">
          <a href="https://dezik.com.ua" target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#9CA3AF]">dezik.com.ua</a>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // Order Detail
  // ═══════════════════════════════════
  if (viewingOrder) {
    const o = viewingOrder;
    const s = statusStyle(o.status_id);
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-md mx-auto px-4 py-5 space-y-4">
          <div className="bg-white rounded-3xl p-5 shadow-sm text-center">
            <p className="text-[13px] text-[#9CA3AF]">Замовлення</p>
            <p className="text-[28px] font-bold text-[#111827] mt-1">#{o.id}</p>
            <div className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-bold border mt-3 ${s.bg} ${s.text} ${s.border}`}>
              {statusIcon(o.status_id)} {o.status}
            </div>
            <p className="text-[14px] text-[#9CA3AF] mt-3">
              {new Date(o.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          {o.ttn && (
            <div className="bg-gradient-to-br from-[#4b569e] to-[#363f75] rounded-3xl p-5 text-white shadow-lg shadow-[#4b569e]/20">
              <p className="text-[12px] uppercase tracking-wider opacity-70">Трекінг Нова Пошта</p>
              <p className="text-[22px] font-mono font-bold mt-2">{o.ttn}</p>
              {o.address && <p className="text-[13px] opacity-80 mt-2 flex items-center gap-1.5"><svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>{o.address}</p>}
              <a href={`https://novaposhta.ua/tracking/?cargo_number=${o.ttn}`}
                target="_blank" rel="noopener noreferrer"
                className="block w-full py-3 rounded-2xl bg-white/20 text-center text-[14px] font-bold mt-4 active:bg-white/30 transition-all">
                <svg className="w-4 h-4 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>Відстежити посилку
              </a>
            </div>
          )}

          <div className="bg-white rounded-3xl p-5 shadow-sm">
            <div className="flex justify-between items-center">
              <span className="text-[15px] text-[#6B7280]">Сума</span>
              <span className="text-[22px] font-bold text-[#111827]">{o.total.toLocaleString('uk-UA')} грн</span>
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#F0F0F0]">
              <span className="text-[14px] text-[#6B7280]">Оплата</span>
              <span className={`text-[14px] font-bold ${o.payment === 'paid' ? 'text-green-600' : 'text-orange-500'}`}>
                {o.payment === 'paid' ? '✅ Оплачено' : '💳 При отриманні'}
              </span>
            </div>
          </div>

          {o.payment !== 'paid' && !paymentSent && (
            <button
              disabled={paymentUploading}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.setAttribute('capture', 'environment');
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  setPaymentUploading(true);
                  try {
                    const fd = new FormData();
                    fd.append('order_id', String(o.id));
                    fd.append('photo', file);
                    const res = await fetch('/api/customer/payment-proof', { method: 'POST', body: fd });
                    const data = await res.json();
                    if (data.ok) {
                      setPaymentSent(true);
                      const tg = (window as unknown as { Telegram?: { WebApp: { HapticFeedback: { notificationOccurred: (s: string) => void } } } }).Telegram?.WebApp;
                      if (tg) tg.HapticFeedback.notificationOccurred('success');
                    }
                  } catch {} finally { setPaymentUploading(false); }
                };
                input.click();
              }}
              className="w-full py-4 rounded-3xl bg-gradient-to-r from-[#10B981] to-[#059669] text-white text-[15px] font-bold shadow-lg shadow-green-500/20 active:scale-[0.97] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {paymentUploading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
              )}
              {paymentUploading ? 'Завантаження...' : 'Підтвердити оплату'}
            </button>
          )}
          {paymentSent && (
            <div className="w-full py-4 rounded-3xl bg-green-50 border border-green-200 text-center">
              <span className="text-[15px] font-bold text-green-600 flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Надіслано на перевірку
              </span>
            </div>
          )}

          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
            <p className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider">Товари ({o.products.length})</p>
            {o.products.map((p, i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#eceef5] to-[#dde0f0] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-[#111827] leading-snug">{p.name}</p>
                  <p className="text-[13px] text-[#9CA3AF] mt-0.5">{p.price.toLocaleString('uk-UA')} грн x {p.qty}</p>
                </div>
                <span className="text-[15px] font-bold text-[#111827] flex-shrink-0">{(p.price * p.qty).toLocaleString('uk-UA')} грн</span>
              </div>
            ))}
          </div>

          {/* Chat with manager button */}
          <button
            onClick={() => { setChatOpen(true); loadChatMessages(o.id); }}
            className="w-full py-4 rounded-3xl bg-white shadow-sm border border-[#E5E7EB] text-[15px] font-bold text-[#4b569e] active:scale-[0.97] transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-11.883 4.744a23.394 23.394 0 01-.032-.258c-.178-1.57-.178-3.403 0-4.972.217-1.909 1.792-3.367 3.699-3.566a36.703 36.703 0 016.872 0c1.907.199 3.482 1.657 3.699 3.566.178 1.569.178 3.402 0 4.972-.217 1.909-1.792 3.367-3.699 3.566a36.68 36.68 0 01-6.872 0 3.834 3.834 0 01-1.775-.618l-2.8.788.788-2.8a3.834 3.834 0 01-.618-1.775 23.47 23.47 0 01-.262-1.903z" /></svg> Написати менеджеру
          </button>

          {/* Repeat order button */}
          <button
            onClick={() => {
              const tg = (window as unknown as { Telegram?: { WebApp: { HapticFeedback: { impactOccurred: (s: string) => void } } } }).Telegram?.WebApp;
              if (tg) tg.HapticFeedback.impactOccurred('medium');
              const newCart: CartItem[] = o.products.map(p => {
                const found = catalog.find(c => c.name.toLowerCase().includes(p.name.toLowerCase().slice(0, 15)));
                return {
                  product: found ?? { id: 0, name: p.name, price: p.price, quantity: 999, thumbnail: null, in_stock: true },
                  qty: p.qty,
                };
              });
              setCart(newCart);
              if (o.city) setCheckoutCity(o.city);
              if (o.address) setCheckoutWarehouse(o.address);
              setViewingOrder(null);
              setView('checkout');
            }}
            className="w-full py-4 rounded-3xl bg-[#eceef5] border border-[#d8dbe8] text-[15px] font-bold text-[#4b569e] active:scale-[0.97] transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            Повторити замовлення
          </button>
        </div>

        {/* Chat overlay */}
        {chatOpen && (
          <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col">
            <div className="bg-white border-b border-[#E5E7EB] px-4 py-3 flex items-center gap-3">
              <button onClick={() => setChatOpen(false)}
                className="w-9 h-9 rounded-xl bg-[#eceef5] flex items-center justify-center active:scale-[0.95] transition-transform">
                <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <div>
                <p className="text-[15px] font-bold text-[#111827]">Чат з менеджером</p>
                <p className="text-[12px] text-[#9CA3AF]">Замовлення #{o.id}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {chatLoading ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4b569e] to-[#363f75] flex items-center justify-center mx-auto shadow-lg shadow-[#4b569e]/25">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>
                  </div>
                  <p className="text-[15px] font-semibold text-[#111827] mt-3">Напишіть нам</p>
                  <p className="text-[13px] text-[#9CA3AF] mt-1">Ми відповімо якнайшвидше</p>
                </div>
              ) : (
                chatMessages.map(m => (
                  <div key={m.id} className={`flex ${m.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed ${
                      m.sender_type === 'customer'
                        ? 'bg-[#4b569e] text-white rounded-br-md'
                        : 'bg-white text-[#111827] border border-[#E5E7EB] rounded-bl-md shadow-sm'
                    }`}>
                      {m.sender_type === 'manager' && (
                        <p className="text-[11px] font-bold text-[#4b569e] mb-1">Менеджер Dezik</p>
                      )}
                      <p>{m.text}</p>
                      <p className={`text-[10px] mt-1 ${m.sender_type === 'customer' ? 'text-white/60' : 'text-[#9CA3AF]'}`}>
                        {new Date(m.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="bg-white border-t border-[#E5E7EB] px-3 pt-3 pb-6 pb-[env(safe-area-inset-bottom)] flex gap-2">
              <input
                type="text"
                value={chatText}
                onChange={e => setChatText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(o.id); } }}
                placeholder="Ваше повідомлення..."
                className="flex-1 px-4 py-3 rounded-2xl bg-[#F0F2F5] text-[#111827] text-[14px] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4b569e]/30"
              />
              <button
                onClick={() => sendChatMessage(o.id)}
                disabled={chatSending || !chatText.trim()}
                className="w-12 h-12 rounded-2xl bg-[#4b569e] text-white flex items-center justify-center active:scale-[0.95] transition-all disabled:opacity-40"
              >
                {chatSending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════
  // Orders List (active or history)
  // ═══════════════════════════════════
  if (view === 'active' || view === 'history') {
    const list = view === 'active' ? activeOrders : historyOrders;
    const title = view === 'active' ? 'Активні замовлення' : 'Історія замовлень';
    const emptyText = view === 'active' ? 'Немає активних замовлень' : 'Історія порожня';

    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-md mx-auto px-4 py-5 space-y-4">
          <h1 className="text-[20px] font-bold text-[#111827]">{title}</h1>

          {list.length === 0 ? (
            <div className="text-center py-16">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${view === 'active' ? 'from-[#3B82F6] to-[#2563EB]' : 'from-[#8B5CF6] to-[#7C3AED]'} flex items-center justify-center mx-auto shadow-md`}>
                {view === 'active' ? (
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                ) : (
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>
                )}
              </div>
              <p className="text-[16px] font-semibold text-[#111827] mt-4">{emptyText}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {list.map(o => {
                const s = statusStyle(o.status_id);
                const accentColor = o.status_id === 12 ? 'bg-green-500' : o.status_id === 19 ? 'bg-red-500' : o.status_id === 8 ? 'bg-blue-500' : 'bg-[#4b569e]';
                return (
                  <button key={o.id} onClick={() => { setViewingOrder(o); setView('order-detail'); setPaymentSent(false); }}
                    className="w-full text-left bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)] active:scale-[0.97] transition-all overflow-hidden">
                    <div className="flex">
                      <div className={`w-1 rounded-full my-3 ml-3 ${accentColor}`} />
                      <div className="flex-1 p-4 pl-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[16px] font-bold text-[#111827]">#{o.id}</span>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
                              {statusIcon(o.status_id)} {o.status}
                            </span>
                          </div>
                          <p className="text-[13px] text-[#9CA3AF] mt-1.5">
                            {new Date(o.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
                            {' \u00b7 '}{o.products.length} товарів
                          </p>
                          {o.ttn && <p className="text-[12px] text-[#4b569e] font-mono font-medium mt-1 truncate">TTH: {o.ttn}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[20px] font-bold text-[#111827]">{o.total.toLocaleString('uk-UA')}</p>
                          <p className="text-[12px] text-[#9CA3AF]">грн</p>
                        </div>
                        <svg className="w-4 h-4 text-[#C0C4CC] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // Certificates
  // ═══════════════════════════════════
  if (view === 'certificates') {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-md mx-auto px-4 py-5 space-y-4">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center mx-auto shadow-lg shadow-[#10B981]/25">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <h1 className="text-[22px] font-bold text-[#111827] mt-4">Сертифікати</h1>
            <p className="text-[14px] text-[#9CA3AF] mt-1">Уся продукція Dezik сертифікована в Україні</p>
          </div>

          {[
            { title: 'Пакети для стерилізації', desc: 'Сертифікат відповідності та висновок СЕС', color: 'from-[#3B82F6] to-[#2563EB]', iconPath: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', url: 'https://csshbetufyocutdislkn.supabase.co/storage/v1/object/public/ops-photos/certificates/pakety-certificate.pdf' },
            { title: 'Деланол', desc: 'Висновок санітарно-епідеміологічної експертизи', color: 'from-[#10B981] to-[#059669]', iconPath: 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5', url: 'https://csshbetufyocutdislkn.supabase.co/storage/v1/object/public/ops-photos/certificates/delanol-certificate.pdf' },
            { title: 'Біонол Форте', desc: 'Сертифікат якості', color: 'from-[#8B5CF6] to-[#7C3AED]', iconPath: 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5', url: 'https://csshbetufyocutdislkn.supabase.co/storage/v1/object/public/ops-photos/certificates/bionol-certificate.pdf' },
            { title: 'Інструм', desc: 'Висновок санітарно-епідеміологічної експертизи', color: 'from-[#F59E0B] to-[#D97706]', iconPath: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z', url: 'https://csshbetufyocutdislkn.supabase.co/storage/v1/object/public/ops-photos/certificates/instrum-certificate.pdf' },
          ].map((cert, i) => (
            <a key={i} href={cert.url} target="_blank" rel="noopener noreferrer"
              className="block bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)] border border-[#F0F0F0] active:scale-[0.97] transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cert.color} flex items-center justify-center flex-shrink-0 shadow-md`}>
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={cert.iconPath} />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-[16px] font-bold text-[#111827]">{cert.title}</p>
                  <p className="text-[13px] text-[#9CA3AF] mt-0.5">{cert.desc}</p>
                </div>
                <svg className="w-5 h-5 text-[#C5C9D1] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </div>
            </a>
          ))}

          <div className="bg-[#F0FDF4] rounded-2xl p-4 border border-[#BBF7D0]">
            <p className="text-[13px] text-[#166534] text-center font-medium">
              Натисніть на сертифікат щоб відкрити PDF
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // Solution preparation
  // ═══════════════════════════════════
  if (view === 'solution') {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-md mx-auto px-4 py-5 space-y-4">
          <h1 className="text-[20px] font-bold text-[#111827]">Як приготувати розчин?</h1>

          {[
            {
              title: 'Деланол — дезінфекція інструментів',
              iconPath: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418',
              gradient: 'from-[#4b569e] to-[#363f75]',
              steps: [
                'Надягніть рукавички',
                'Розведіть 20 мл Деланолу на 1 л води',
                'Занурте інструменти на 60 хвилин',
                'Промийте під проточною водою',
                'Висушіть та упакуйте в пакет для стерилізації',
              ],
              color: '#4b569e',
            },
            {
              title: 'Біонол — ПСО інструментів',
              iconPath: 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5',
              gradient: 'from-[#10B981] to-[#059669]',
              steps: [
                'Приготуйте розчин: 20 мл Біонолу на 1 л води',
                'Занурте інструменти на 15 хвилин',
                'Очистіть щіткою під розчином',
                'Промийте під водою 30 секунд',
                'Висушіть',
              ],
              color: '#10B981',
            },
            {
              title: 'Інструм — очистка від нагару',
              iconPath: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z',
              gradient: 'from-[#F59E0B] to-[#D97706]',
              steps: [
                'Нанесіть Інструм на забруднену поверхню',
                'Залиште на 5-10 хвилин',
                'Протріть щіткою або серветкою',
                'Промийте водою',
              ],
              color: '#F59E0B',
            },
          ].map((recipe, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-[#F0F0F0]">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${recipe.gradient} flex items-center justify-center shadow-md`}>
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={recipe.iconPath} /></svg>
                </div>
                <p className="text-[16px] font-bold text-[#111827]">{recipe.title}</p>
              </div>
              <div className="space-y-3">
                {recipe.steps.map((step, j) => (
                  <div key={j} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: recipe.color }}>
                      {j + 1}
                    </div>
                    <p className="text-[14px] text-[#111827] leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // Profile
  // ═══════════════════════════════════
  if (view === 'profile') {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-md mx-auto px-4 py-5 space-y-4">
          <h1 className="text-[20px] font-bold text-[#111827]">Моя інформація</h1>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#F0F0F0] space-y-4">
            <div>
              <p className="text-[12px] text-[#9CA3AF] mb-1">Ім'я та прізвище</p>
              <input type="text" value={checkoutName} onChange={(e) => setCheckoutName(e.target.value)}
                placeholder="Введіть ваше ім'я"
                className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[#111827] text-[15px] placeholder:text-[#9CA3AF] focus:border-[#4b569e] focus:outline-none" />
            </div>
            <div>
              <p className="text-[12px] text-[#9CA3AF] mb-1">Телефон</p>
              <div className="h-[48px] px-4 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] flex items-center text-[15px] text-[#9CA3AF]">
                +380{phone}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#F0F0F0] space-y-4">
            <p className="text-[14px] font-bold text-[#111827] flex items-center gap-1.5"><svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>Адреса доставки</p>
            <div className="relative">
              <p className="text-[12px] text-[#9CA3AF] mb-1">Місто</p>
              <input type="text" value={checkoutCity} onChange={(e) => searchCity(e.target.value)}
                onFocus={() => checkoutCity.length >= 2 && setShowCitySuggestions(true)}
                placeholder="Почніть вводити місто"
                className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[#111827] text-[15px] placeholder:text-[#9CA3AF] focus:border-[#4b569e] focus:outline-none" />
              {showCitySuggestions && citySuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-xl border border-[#E5E7EB] shadow-lg max-h-[200px] overflow-y-auto">
                  {citySuggestions.map(c => (
                    <button key={c.ref} onClick={() => selectCity(c)}
                      className="w-full text-left px-4 py-3 text-[14px] border-b border-[#F5F5F5] last:border-0 active:bg-[#F8FAFC]">
                      <span className="font-medium text-[#111827]">{c.name}</span>
                      <span className="text-[12px] text-[#9CA3AF] ml-2">{c.area}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <p className="text-[12px] text-[#9CA3AF] mb-1">Відділення / поштомат НП</p>
              <input type="text" value={checkoutWarehouse} onChange={(e) => searchWarehouse(e.target.value)}
                onFocus={() => checkoutCityRef && loadWarehouses(checkoutCityRef, checkoutWarehouse)}
                placeholder={checkoutCityRef ? 'Пошук відділення' : 'Спочатку оберіть місто'}
                disabled={!checkoutCityRef}
                className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[#111827] text-[15px] placeholder:text-[#9CA3AF] focus:border-[#4b569e] focus:outline-none disabled:bg-[#F8FAFC] disabled:text-[#C5C9D1]" />
              {showWarehouseSuggestions && warehouseSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-xl border border-[#E5E7EB] shadow-lg max-h-[250px] overflow-y-auto">
                  {warehouseSuggestions.map(w => (
                    <button key={w.ref} onClick={() => selectWarehouse(w)}
                      className="w-full text-left px-4 py-3 text-[13px] text-[#111827] border-b border-[#F5F5F5] last:border-0 active:bg-[#F8FAFC]">
                      {w.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {profile && (
            <p className="text-[12px] text-[#9CA3AF] text-center">
              Дані заповнені з вашого останнього замовлення
            </p>
          )}

          <button onClick={() => {
            localStorage.setItem('dezik_checkout', JSON.stringify({ name: checkoutName, city: checkoutCity, warehouse: checkoutWarehouse }));
            setView('menu');
          }}
            className="w-full py-4 rounded-2xl bg-gradient-to-b from-[#4b569e] to-[#363f75] text-white text-[16px] font-bold
              shadow-lg shadow-[#4b569e]/25 active:scale-[0.97] transition-all">
            Зберегти
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // Order Success
  // ═══════════════════════════════════
  if (view === 'order-success') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-6">
        <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <svg className="w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-[22px] font-bold text-[#111827]">Замовлення оформлено!</h2>
        <p className="text-[15px] text-[#9CA3AF] mt-2 text-center">Замовлення #{newOrderId}<br/>Менеджер зв'яжеться з вами</p>
        <button onClick={() => { setView('menu'); searchOrders(phone); }}
          className="mt-8 px-8 py-3 rounded-2xl bg-[#4b569e] text-white text-[15px] font-bold active:scale-[0.97] transition-all">
          На головну
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════
  // Checkout
  // ═══════════════════════════════════
  if (view === 'checkout') {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-md mx-auto px-4 py-5 space-y-4">
          <h1 className="text-[20px] font-bold text-[#111827]">Оформлення замовлення</h1>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#F0F0F0] space-y-3">
            <p className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider">Ваші дані</p>
            <input type="text" placeholder="Ваше ім'я та прізвище" value={checkoutName}
              onChange={(e) => setCheckoutName(e.target.value)}
              className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[#111827] text-[15px] placeholder:text-[#9CA3AF] focus:border-[#4b569e] focus:outline-none" />
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-[#9CA3AF]">+380</span>
              <input type="tel" value={phone} disabled
                className="w-full h-[48px] pl-[68px] pr-4 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] text-[15px] text-[#9CA3AF]" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#F0F0F0] space-y-3">
            <p className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider">Доставка (Нова Пошта)</p>
            <div className="relative">
              <input type="text" placeholder="Місто" value={checkoutCity}
                onChange={(e) => searchCity(e.target.value)}
                onFocus={() => checkoutCity.length >= 2 && setShowCitySuggestions(true)}
                className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[#111827] text-[15px] placeholder:text-[#9CA3AF] focus:border-[#4b569e] focus:outline-none" />
              {showCitySuggestions && citySuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-xl border border-[#E5E7EB] shadow-lg max-h-[200px] overflow-y-auto">
                  {citySuggestions.map(c => (
                    <button key={c.ref} onClick={() => selectCity(c)}
                      className="w-full text-left px-4 py-3 text-[14px] border-b border-[#F5F5F5] last:border-0 active:bg-[#F8FAFC]">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-[12px] text-[#9CA3AF] ml-2">{c.area}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <input type="text" placeholder={checkoutCityRef ? 'Пошук відділення' : 'Спочатку оберіть місто'} value={checkoutWarehouse}
                onChange={(e) => searchWarehouse(e.target.value)}
                onFocus={() => checkoutCityRef && loadWarehouses(checkoutCityRef, checkoutWarehouse)}
                disabled={!checkoutCityRef}
                className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[#111827] text-[15px] placeholder:text-[#9CA3AF] focus:border-[#4b569e] focus:outline-none disabled:bg-[#F8FAFC]" />
              {showWarehouseSuggestions && warehouseSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-xl border border-[#E5E7EB] shadow-lg max-h-[250px] overflow-y-auto">
                  {warehouseSuggestions.map(w => (
                    <button key={w.ref} onClick={() => selectWarehouse(w)}
                      className="w-full text-left px-4 py-3 text-[13px] border-b border-[#F5F5F5] last:border-0 active:bg-[#F8FAFC]">
                      {w.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#F0F0F0]">
            <p className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-3">Замовлення ({cartCount} товарів)</p>
            {cart.map(item => (
              <div key={item.product.id} className="flex justify-between items-center py-2">
                <div className="flex-1">
                  <p className="text-[14px] text-[#111827]">{item.product.name}</p>
                  <p className="text-[12px] text-[#9CA3AF]">{item.product.price} грн × {item.qty}</p>
                </div>
                <span className="text-[14px] font-bold">{(item.product.price * item.qty).toLocaleString('uk-UA')} грн</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3 mt-2 border-t border-[#F0F0F0]">
              <span className="text-[16px] font-bold">Разом</span>
              <span className="text-[20px] font-bold text-[#4b569e]">{cartTotal.toLocaleString('uk-UA')} грн</span>
            </div>
          </div>

          <button onClick={submitOrder} disabled={!checkoutName || ordering}
            className="w-full py-4 rounded-2xl bg-gradient-to-b from-[#4b569e] to-[#363f75] text-white text-[16px] font-bold
              shadow-lg shadow-[#4b569e]/25 active:scale-[0.97] transition-all disabled:opacity-40">
            {ordering ? 'Оформлюємо...' : `Замовити · ${cartTotal.toLocaleString('uk-UA')} грн`}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // Cart
  // ═══════════════════════════════════
  if (view === 'cart') {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-md mx-auto px-4 py-5 space-y-4">
          <h1 className="text-[20px] font-bold text-[#111827]">Кошик</h1>

          {cart.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4b569e] to-[#363f75] flex items-center justify-center mx-auto shadow-md">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>
              </div>
              <p className="text-[16px] font-semibold text-[#111827] mt-4">Кошик порожній</p>
              <button onClick={() => setView('shop')} className="mt-4 text-[14px] text-[#4b569e] font-semibold">← До каталогу</button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.product.id} className="bg-white rounded-2xl p-4 shadow-sm border border-[#F0F0F0]">
                    <div className="flex gap-3">
                      {item.product.thumbnail && (
                        <img src={item.product.thumbnail} alt="" className="w-16 h-16 rounded-xl object-contain bg-white border border-[#E5E7EB] p-1 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="text-[14px] font-medium text-[#111827] leading-snug">{item.product.name}</p>
                        <p className="text-[14px] font-bold text-[#4b569e] mt-1">{item.product.price} грн</p>
                        <div className="flex items-center gap-3 mt-2">
                          <button onClick={() => updateCartQty(item.product.id, item.qty - 1)}
                            className="w-8 h-8 rounded-lg bg-[#F0F0F0] flex items-center justify-center text-[16px] font-bold active:scale-[0.9] transition-all">−</button>
                          <span className="text-[16px] font-bold w-8 text-center">{item.qty}</span>
                          <button onClick={() => updateCartQty(item.product.id, item.qty + 1)}
                            className="w-8 h-8 rounded-lg bg-[#4b569e] text-white flex items-center justify-center text-[16px] font-bold active:scale-[0.9] transition-all">+</button>
                          <span className="ml-auto text-[15px] font-bold text-[#111827]">{(item.product.price * item.qty).toLocaleString('uk-UA')} грн</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#F0F0F0] flex justify-between items-center">
                <span className="text-[16px] font-bold text-[#111827]">Разом</span>
                <span className="text-[22px] font-bold text-[#4b569e]">{cartTotal.toLocaleString('uk-UA')} грн</span>
              </div>

              <button onClick={() => setView('checkout')}
                className="w-full py-4 rounded-2xl bg-gradient-to-b from-[#4b569e] to-[#363f75] text-white text-[16px] font-bold
                  shadow-lg shadow-[#4b569e]/25 active:scale-[0.97] transition-all">
                Оформити замовлення
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // Shop / Product Detail
  // ═══════════════════════════════════
  if (view === 'shop' && viewingProduct) {
    const p = viewingProduct;
    const inCart = cart.find(i => i.product.id === p.id);
    const description = getProductDescription(p.name);
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-md mx-auto px-4 py-5 space-y-4">
          {/* Back button */}
          <button onClick={() => setViewingProduct(null)}
            className="flex items-center gap-2 text-[14px] font-semibold text-[#4b569e] active:opacity-70 transition-opacity">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Назад до каталогу
          </button>

          {/* Product image */}
          <div className="bg-white rounded-3xl shadow-sm border border-[#F0F0F0] overflow-hidden">
            {p.thumbnail ? (
              <button onClick={() => setProductLightbox(p.thumbnail)} className="w-full">
                <img src={p.thumbnail} alt={p.name}
                  className="w-full aspect-square object-contain bg-white p-6" />
              </button>
            ) : (
              <div className="w-full aspect-square bg-[#eceef5] flex items-center justify-center">
                <svg className="w-20 h-20 text-[#4b569e]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            )}
          </div>

          {/* Photo lightbox */}
          {productLightbox && (
            <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setProductLightbox(null)}>
              <img src={productLightbox} alt="" className="max-w-full max-h-[85vh] rounded-2xl object-contain" />
              <button className="absolute top-4 right-4 w-11 h-11 bg-white/20 rounded-full flex items-center justify-center text-white" onClick={() => setProductLightbox(null)}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Product info */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#F0F0F0] space-y-4">
            <h1 className="text-[20px] font-bold text-[#111827] leading-snug">{p.name}</h1>

            <div className="flex items-center justify-between">
              <p className="text-[28px] font-bold text-[#4b569e]">{p.price.toLocaleString('uk-UA')} <span className="text-[16px]">грн</span></p>
              {p.in_stock ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-[12px] font-bold text-green-700">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  В наявності
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-[12px] font-bold text-red-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Немає
                </span>
              )}
            </div>

            {/* Description */}
            <div className="pt-2 border-t border-[#F0F0F0]">
              <p className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Опис</p>
              <p className="text-[14px] text-[#6B7280] leading-relaxed">{description}</p>
            </div>

            {/* Category badge */}
            {p.category && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-xl bg-[#eceef5] text-[12px] font-semibold text-[#4b569e]">{p.category}</span>
              </div>
            )}
          </div>

          {/* Add to cart / Quantity controls */}
          <div className="pb-4">
            {p.in_stock ? (
              inCart ? (
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#4b569e]/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-[#6B7280]">В кошику</span>
                    <span className="text-[16px] font-bold text-[#111827]">{(p.price * inCart.qty).toLocaleString('uk-UA')} грн</span>
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <button onClick={() => updateCartQty(p.id, inCart.qty - 1)}
                      className="w-12 h-12 rounded-2xl bg-[#F0F0F0] flex items-center justify-center text-[20px] font-bold text-[#111827] active:scale-[0.93] transition-transform">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                      </svg>
                    </button>
                    <span className="text-[24px] font-bold text-[#111827] w-12 text-center">{inCart.qty}</span>
                    <button onClick={() => updateCartQty(p.id, inCart.qty + 1)}
                      className="w-12 h-12 rounded-2xl bg-[#4b569e] text-white flex items-center justify-center active:scale-[0.93] transition-transform">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </button>
                  </div>
                  <button onClick={() => setView('cart')}
                    className="w-full py-3 rounded-2xl bg-[#eceef5] text-[#4b569e] text-[14px] font-bold active:scale-[0.97] transition-all flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>
                    Перейти до кошика
                  </button>
                </div>
              ) : (
                <button onClick={() => addToCart(p)}
                  className="w-full py-4 rounded-2xl bg-gradient-to-b from-[#4b569e] to-[#363f75] text-white text-[16px] font-bold
                    shadow-xl shadow-[#4b569e]/30 active:scale-[0.97] transition-all flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                  Додати в кошик
                </button>
              )
            ) : (
              <button disabled
                className="w-full py-4 rounded-2xl bg-[#E5E7EB] text-[#9CA3AF] text-[16px] font-bold cursor-not-allowed">
                Немає в наявності
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // Shop / Catalog
  // ═══════════════════════════════════
  if (view === 'shop') {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-md mx-auto px-4 py-5 space-y-4">
          <div className="flex justify-between items-center">
            <h1 className="text-[20px] font-bold text-[#111827]">Магазин</h1>
            {cartCount > 0 && (
              <button onClick={() => setView('cart')}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#4b569e] text-white text-[13px] font-bold active:scale-[0.97] transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg> {cartCount} · {cartTotal.toLocaleString('uk-UA')} грн
              </button>
            )}
          </div>

          {/* Category filter */}
          {catalogCategories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button onClick={() => setSelectedCategory(null)}
                className={`px-3 py-2 rounded-xl text-[13px] font-bold whitespace-nowrap transition-all ${
                  !selectedCategory ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#F0F0F0]'
                }`}>Все</button>
              {catalogCategories.map(c => (
                <button key={c} onClick={() => setSelectedCategory(c)}
                  className={`px-3 py-2 rounded-xl text-[13px] font-bold whitespace-nowrap transition-all ${
                    selectedCategory === c ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#F0F0F0]'
                  }`}>{c}</button>
              ))}
            </div>
          )}

          {catalogLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {catalog.filter(p => !selectedCategory || p.category === selectedCategory).map(p => {
                const inCart = cart.find(i => i.product.id === p.id);
                return (
                  <div key={p.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${inCart ? 'border-[#4b569e]/30' : 'border-[#F0F0F0]'} active:scale-[0.98] transition-transform cursor-pointer`}
                    onClick={() => setViewingProduct(p)}>
                    <div className="flex gap-3">
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt="" className="w-20 h-20 rounded-xl object-contain bg-white border border-[#E5E7EB] p-1 flex-shrink-0" />
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-[#eceef5] flex items-center justify-center flex-shrink-0">
                          <svg className="w-8 h-8 text-[#4b569e]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-[14px] font-medium text-[#111827] leading-snug">{p.name}</p>
                        <p className="text-[16px] font-bold text-[#4b569e] mt-1">{p.price} грн</p>
                        <div className="flex items-center justify-between mt-2">
                          {p.in_stock ? (
                            <span className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                              В наявності
                            </span>
                          ) : (
                            <span className="text-[11px] text-red-500 font-medium">Немає в наявності</span>
                          )}
                          {inCart && (
                            <span className="text-[11px] font-bold text-[#4b569e] bg-[#eceef5] px-2 py-0.5 rounded-lg">{inCart.qty} в кошику</span>
                          )}
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-[#C5C9D1] self-center flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Floating cart button */}
          {cartCount > 0 && (
            <div className="sticky bottom-4">
              <button onClick={() => setView('cart')}
                className="w-full py-4 rounded-2xl bg-gradient-to-b from-[#4b569e] to-[#363f75] text-white text-[16px] font-bold
                  shadow-xl shadow-[#4b569e]/30 active:scale-[0.97] transition-all">
                <svg className="w-5 h-5 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>Кошик · {cartCount} товарів · {cartTotal.toLocaleString('uk-UA')} грн
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // AI Chat
  // ═══════════════════════════════════
  if (view === 'ai-chat') {
    const sendAiMessage = async (text?: string) => {
      const msg = text ?? aiText.trim();
      if (!msg || aiSending) return;
      setAiMessages(prev => [...prev, { role: 'user', text: msg }]);
      setAiText('');
      setAiSending(true);
      try {
        const res = await fetch('/api/customer/ai-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg, history: aiMessages }),
        });
        const data = await res.json();
        if (data.redirected) {
          setAiMessages(prev => [...prev, { role: 'ai', text: data.reply }, { role: 'ai', text: 'Менеджер відповість найближчим часом. Ви можете написати йому у чаті замовлення.' }]);
        } else if (data.reply) {
          setAiMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
        } else {
          setAiMessages(prev => [...prev, { role: 'ai', text: 'Вибачте, сталася помилка. Спробуйте ще раз.' }]);
        }
      } catch {
        setAiMessages(prev => [...prev, { role: 'ai', text: 'Вибачте, сталася помилка. Спробуйте ще раз.' }]);
      } finally { setAiSending(false); }
    };

    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-[#E5E7EB] px-4 py-3 flex items-center gap-3">
          <button onClick={() => { setView('menu'); setAiMessages([]); setAiText(''); }}
            className="w-9 h-9 rounded-xl bg-[#eceef5] flex items-center justify-center active:scale-[0.95] transition-transform">
            <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4b569e] to-[#8B5CF6] flex items-center justify-center shadow-md">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <div>
            <p className="text-[15px] font-bold text-[#111827]">AI Консультант Dezik</p>
            <p className="text-[12px] text-[#9CA3AF]">Запитай про продукцію</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {aiMessages.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4b569e] to-[#8B5CF6] flex items-center justify-center mx-auto shadow-lg shadow-[#4b569e]/25">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-[#111827] mt-3">Привіт! Я AI-помічник Dezik</p>
              <p className="text-[13px] text-[#9CA3AF] mt-1 leading-relaxed">Запитайте про продукцію, як приготувати<br/>розчини або про доставку</p>
            </div>
          ) : (
            aiMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#4b569e] text-white rounded-br-md'
                    : 'bg-white text-[#111827] border border-[#E5E7EB] rounded-bl-md shadow-sm'
                }`}>
                  {m.role === 'ai' && (
                    <p className="text-[11px] font-bold bg-gradient-to-r from-[#4b569e] to-[#8B5CF6] bg-clip-text text-transparent mb-1">AI Dezik</p>
                  )}
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
              </div>
            ))
          )}
          {aiSending && (
            <div className="flex justify-start">
              <div className="max-w-[80%] px-4 py-3 rounded-2xl bg-white border border-[#E5E7EB] rounded-bl-md shadow-sm">
                <div className="flex gap-1.5 items-center">
                  <div className="w-2 h-2 rounded-full bg-[#4b569e] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-[#4b569e] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-[#4b569e] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick questions */}
        {aiMessages.length === 0 && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap gap-2">
              {['Як розвести Деланол?', 'Які є пакети?', 'Як замовити?', 'Доставка і оплата'].map(q => (
                <button key={q} onClick={() => sendAiMessage(q)}
                  className="px-3.5 py-2 rounded-full bg-white border border-[#E5E7EB] text-[13px] font-medium text-[#4b569e] shadow-sm active:scale-[0.95] transition-all">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="bg-white border-t border-[#E5E7EB] px-3 pt-3 pb-6 flex gap-2" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <input
            type="text"
            value={aiText}
            onChange={e => setAiText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
            placeholder="Запитайте щось..."
            disabled={aiSending}
            className="flex-1 px-4 py-3 rounded-2xl bg-[#F0F2F5] text-[#111827] text-[14px] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4b569e]/30 disabled:opacity-60"
          />
          <button
            onClick={() => sendAiMessage()}
            disabled={aiSending || !aiText.trim()}
            className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#4b569e] to-[#8B5CF6] text-white flex items-center justify-center active:scale-[0.95] transition-all disabled:opacity-40 shadow-md"
          >
            {aiSending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // Main Menu
  // ═══════════════════════════════════
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-md mx-auto px-4 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-[#4b569e] to-[#363f75] flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-[#4b569e]/25">
              D
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-[#111827]">Мій кабінет</h1>
              <p className="text-[13px] text-[#9CA3AF]">+380{phone}</p>
            </div>
          </div>
          <button onClick={logout} className="text-[13px] text-[#9CA3AF] active:text-red-500 transition-colors">Вийти</button>
        </div>

        {/* Active order card */}
        {activeOrders.length > 0 && (
          <button onClick={() => { setViewingOrder(activeOrders[0]); setView('order-detail'); }}
            className="w-full text-left bg-gradient-to-br from-[#4b569e] to-[#363f75] rounded-3xl p-5 text-white shadow-lg shadow-[#4b569e]/20 active:scale-[0.97] transition-all">
            <p className="text-[12px] uppercase tracking-wider opacity-70">Активне замовлення</p>
            <div className="flex justify-between items-end mt-2">
              <div>
                <p className="text-[24px] font-bold">#{activeOrders[0].id}</p>
                <p className="text-[14px] opacity-80 mt-1">{activeOrders[0].status}</p>
              </div>
              <p className="text-[22px] font-bold">{activeOrders[0].total.toLocaleString('uk-UA')} <span className="text-[14px] opacity-70">грн</span></p>
            </div>
            {activeOrders[0].ttn && (
              <div className="mt-3 pt-3 border-t border-white/20">
                <p className="text-[12px] opacity-60">ТТН</p>
                <p className="text-[16px] font-mono font-bold">{activeOrders[0].ttn}</p>
              </div>
            )}
          </button>
        )}

        {/* Menu buttons */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            ), color: 'from-[#3B82F6] to-[#2563EB]', label: 'Активні замовлення', desc: activeOrders.length > 0 ? `${activeOrders.length} замовлень` : 'Немає', view: 'active' as View, badge: activeOrders.length },
            { icon: (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            ), color: 'from-[#8B5CF6] to-[#7C3AED]', label: 'Історія замовлень', desc: `${historyOrders.length} замовлень`, view: 'history' as View },
            { icon: (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            ), color: 'from-[#10B981] to-[#059669]', label: 'Сертифікати', desc: 'Якість продукції', view: 'certificates' as View },
            { icon: (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            ), color: 'from-[#F59E0B] to-[#D97706]', label: 'Як приготувати розчин?', desc: 'Інструкції', view: 'solution' as View },
          ].map((item, idx) => (
            <button key={idx} onClick={() => setView(item.view)}
              className="relative flex flex-col items-start gap-3 bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)] border border-[#F0F0F0]
                active:scale-[0.96] transition-all text-left">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white shadow-md`}>
                {item.icon}
              </div>
              <div>
                <p className="text-[14px] font-bold text-[#111827] leading-tight">{item.label}</p>
                <p className="text-[12px] text-[#9CA3AF] mt-0.5">{item.desc}</p>
              </div>
              {item.badge && item.badge > 0 && (
                <span className="absolute top-3 right-3 min-w-[22px] h-[22px] rounded-full bg-[#EF4444] text-white text-[11px] font-bold flex items-center justify-center px-1.5 shadow-sm shadow-red-500/30">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* AI Consultant */}
        <button onClick={() => setView('ai-chat')}
          className="w-full flex items-center gap-4 bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)] border border-[#E5E7EB] active:scale-[0.97] transition-all">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#4b569e] to-[#8B5CF6] flex items-center justify-center text-white shadow-md">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="text-[15px] font-bold text-[#111827]">AI Консультант</p>
            <p className="text-[12px] text-[#9CA3AF]">Запитай про продукцію</p>
          </div>
          <svg className="w-5 h-5 text-[#C5C9D1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Profile */}
        <button onClick={() => setView('profile')}
          className="w-full flex items-center gap-4 bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)] border border-[#F0F0F0] active:scale-[0.97] transition-all">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#6B7280] to-[#4B5563] flex items-center justify-center text-white shadow-md">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="text-[15px] font-bold text-[#111827]">Моя інформація</p>
            <p className="text-[12px] text-[#9CA3AF]">{profile?.name || 'Адреса доставки'}</p>
          </div>
          <svg className="w-5 h-5 text-[#C5C9D1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Shop button */}
        <button onClick={() => { setView('shop'); loadCatalog(); }}
          className="w-full flex items-center gap-4 bg-gradient-to-r from-[#4b569e] to-[#363f75] rounded-2xl p-4 shadow-lg shadow-[#4b569e]/20 active:scale-[0.97] transition-all">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="text-[16px] font-bold text-white">Магазин</p>
            <p className="text-[12px] text-white/70">Замовити з доставкою НП</p>
          </div>
          {cartCount > 0 && (
            <span className="min-w-[24px] h-[24px] rounded-full bg-white text-[#4b569e] text-[12px] font-bold flex items-center justify-center px-1.5">
              {cartCount}
            </span>
          )}
          <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Links */}
        <div className="flex justify-center gap-6 pt-2">
          <a href="https://dezik.com.ua" target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#4b569e] font-semibold hover:underline">dezik.com.ua</a>
          <a href="https://www.instagram.com/dezik_ua/" target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#4b569e] font-semibold hover:underline">Instagram</a>
        </div>

        <p className="text-center text-[11px] text-[#C5C9D1] pt-1 pb-4">Dezik Ukraine · dezik.com.ua</p>
      </div>
    </div>
  );
}
