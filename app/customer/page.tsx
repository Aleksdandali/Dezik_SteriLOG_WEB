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

type View = 'menu' | 'active' | 'history' | 'certificates' | 'solution' | 'order-detail' | 'shop' | 'cart' | 'checkout' | 'order-success' | 'profile';

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
      else if (view !== 'menu') setView('menu');
    };
    if (view !== 'menu' || viewingOrder || chatOpen) { tg.BackButton.show(); tg.BackButton.onClick(handleBack); }
    else { tg.BackButton.hide(); }
    return () => { tg.BackButton.offClick(handleBack); };
  }, [view, viewingOrder, chatOpen]);

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

  const statusStyle = (id: number) => {
    if (id === 12) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: '✅' };
    if (id === 8) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: '📦' };
    if (id === 19) return { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: '❌' };
    if (id === 4 || id === 10) return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: '💳' };
    return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: '🆕' };
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
                className="w-full h-[56px] pl-[76px] pr-5 rounded-2xl border-2 border-[#E5E7EB] bg-white text-[18px] font-medium
                  focus:border-[#4b569e] focus:outline-none transition-all" />
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
              {s.icon} {o.status}
            </div>
            <p className="text-[14px] text-[#9CA3AF] mt-3">
              {new Date(o.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          {o.ttn && (
            <div className="bg-gradient-to-br from-[#4b569e] to-[#363f75] rounded-3xl p-5 text-white shadow-lg shadow-[#4b569e]/20">
              <p className="text-[12px] uppercase tracking-wider opacity-70">Трекінг Нова Пошта</p>
              <p className="text-[22px] font-mono font-bold mt-2">{o.ttn}</p>
              {o.address && <p className="text-[13px] opacity-80 mt-2">📍 {o.address}</p>}
              <a href={`https://novaposhta.ua/tracking/?cargo_number=${o.ttn}`}
                target="_blank" rel="noopener noreferrer"
                className="block w-full py-3 rounded-2xl bg-white/20 text-center text-[14px] font-bold mt-4 active:bg-white/30 transition-all">
                🔍 Відстежити посилку
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

          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
            <p className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider">Товари ({o.products.length})</p>
            {o.products.map((p, i) => (
              <div key={i} className="flex justify-between items-start py-2">
                <div className="flex-1 pr-3">
                  <p className="text-[14px] font-medium text-[#111827] leading-snug">{p.name}</p>
                  <p className="text-[13px] text-[#9CA3AF] mt-0.5">{p.price.toLocaleString('uk-UA')} грн × {p.qty}</p>
                </div>
                <span className="text-[15px] font-bold text-[#111827]">{(p.price * p.qty).toLocaleString('uk-UA')} грн</span>
              </div>
            ))}
          </div>

          {/* Chat with manager button */}
          <button
            onClick={() => { setChatOpen(true); loadChatMessages(o.id); }}
            className="w-full py-4 rounded-3xl bg-white shadow-sm border border-[#E5E7EB] text-[15px] font-bold text-[#4b569e] active:scale-[0.97] transition-all flex items-center justify-center gap-2"
          >
            💬 Написати менеджеру
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
                  <p className="text-[40px]">💬</p>
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

            <div className="bg-white border-t border-[#E5E7EB] p-3 flex gap-2">
              <input
                type="text"
                value={chatText}
                onChange={e => setChatText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(o.id); } }}
                placeholder="Ваше повідомлення..."
                className="flex-1 px-4 py-3 rounded-2xl bg-[#F0F2F5] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#4b569e]/30"
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
    const emptyIcon = view === 'active' ? '✨' : '📋';
    const emptyText = view === 'active' ? 'Немає активних замовлень' : 'Історія порожня';

    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-md mx-auto px-4 py-5 space-y-4">
          <h1 className="text-[20px] font-bold text-[#111827]">{title}</h1>

          {list.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[48px]">{emptyIcon}</p>
              <p className="text-[16px] font-semibold text-[#111827] mt-4">{emptyText}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {list.map(o => {
                const s = statusStyle(o.status_id);
                return (
                  <button key={o.id} onClick={() => { setViewingOrder(o); setView('order-detail'); }}
                    className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-[#F0F0F0] active:scale-[0.97] transition-all">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[16px] font-bold text-[#111827]">#{o.id}</span>
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
                            {s.icon} {o.status}
                          </span>
                        </div>
                        <p className="text-[13px] text-[#9CA3AF] mt-1.5">
                          {new Date(o.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
                          {' · '}{o.products.length} товарів
                        </p>
                        {o.ttn && <p className="text-[12px] text-[#4b569e] font-mono font-medium mt-1">ТТН: {o.ttn}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[18px] font-bold text-[#111827]">{o.total.toLocaleString('uk-UA')}</p>
                        <p className="text-[12px] text-[#9CA3AF]">грн</p>
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
          <h1 className="text-[20px] font-bold text-[#111827]">Сертифікати</h1>
          <p className="text-[14px] text-[#9CA3AF]">Уся продукція Dezik сертифікована в Україні</p>

          {[
            { title: 'Пакети для стерилізації', desc: 'Сертифікат відповідності та висновок СЕС', icon: '📋' },
            { title: 'Деланол', desc: 'Сертифікат на дезінфікуючий засіб', icon: '🧪' },
            { title: 'Біонол', desc: 'Сертифікат на засіб для ПСО', icon: '🧴' },
            { title: 'Інструм', desc: 'Сертифікат на очищувач інструментів', icon: '✨' },
          ].map((cert, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-[#F0F0F0]">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#eceef5] flex items-center justify-center text-xl flex-shrink-0">
                  {cert.icon}
                </div>
                <div>
                  <p className="text-[15px] font-bold text-[#111827]">{cert.title}</p>
                  <p className="text-[13px] text-[#9CA3AF] mt-0.5">{cert.desc}</p>
                </div>
              </div>
            </div>
          ))}

          <p className="text-[13px] text-[#9CA3AF] text-center pt-4">
            Для отримання копій сертифікатів зверніться до менеджера
          </p>
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
              icon: '💧',
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
              icon: '🧴',
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
              icon: '✨',
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
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: `${recipe.color}15` }}>
                  {recipe.icon}
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
                className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[15px] focus:border-[#4b569e] focus:outline-none" />
            </div>
            <div>
              <p className="text-[12px] text-[#9CA3AF] mb-1">Телефон</p>
              <div className="h-[48px] px-4 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] flex items-center text-[15px] text-[#9CA3AF]">
                +380{phone}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#F0F0F0] space-y-4">
            <p className="text-[14px] font-bold text-[#111827]">📍 Адреса доставки</p>
            <div className="relative">
              <p className="text-[12px] text-[#9CA3AF] mb-1">Місто</p>
              <input type="text" value={checkoutCity} onChange={(e) => searchCity(e.target.value)}
                onFocus={() => checkoutCity.length >= 2 && setShowCitySuggestions(true)}
                placeholder="Почніть вводити місто"
                className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[15px] focus:border-[#4b569e] focus:outline-none" />
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
                className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[15px] focus:border-[#4b569e] focus:outline-none disabled:bg-[#F8FAFC] disabled:text-[#C5C9D1]" />
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
              className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[15px] focus:border-[#4b569e] focus:outline-none" />
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
                className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[15px] focus:border-[#4b569e] focus:outline-none" />
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
                className="w-full h-[48px] px-4 rounded-xl border border-[#E5E7EB] text-[15px] focus:border-[#4b569e] focus:outline-none disabled:bg-[#F8FAFC]" />
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
              <p className="text-[48px]">🛒</p>
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
                🛒 {cartCount} · {cartTotal.toLocaleString('uk-UA')} грн
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
                  <div key={p.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${inCart ? 'border-[#4b569e]/30' : 'border-[#F0F0F0]'}`}>
                    <div className="flex gap-3">
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt="" className="w-20 h-20 rounded-xl object-contain bg-white border border-[#E5E7EB] p-1 flex-shrink-0" />
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-[#eceef5] flex items-center justify-center text-2xl flex-shrink-0">📦</div>
                      )}
                      <div className="flex-1">
                        <p className="text-[14px] font-medium text-[#111827] leading-snug">{p.name}</p>
                        <p className="text-[16px] font-bold text-[#4b569e] mt-1">{p.price} грн</p>
                        <div className="flex items-center justify-between mt-2">
                          {p.in_stock ? (
                            <span className="text-[11px] text-green-600 font-medium">✓ В наявності</span>
                          ) : (
                            <span className="text-[11px] text-red-500 font-medium">Немає в наявності</span>
                          )}
                          {p.in_stock && (
                            inCart ? (
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateCartQty(p.id, inCart.qty - 1)}
                                  className="w-7 h-7 rounded-lg bg-[#F0F0F0] flex items-center justify-center text-[14px] font-bold">−</button>
                                <span className="text-[14px] font-bold w-5 text-center">{inCart.qty}</span>
                                <button onClick={() => updateCartQty(p.id, inCart.qty + 1)}
                                  className="w-7 h-7 rounded-lg bg-[#4b569e] text-white flex items-center justify-center text-[14px] font-bold">+</button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(p)}
                                className="px-4 py-1.5 rounded-xl bg-[#4b569e] text-white text-[13px] font-bold active:scale-[0.95] transition-all">
                                В кошик
                              </button>
                            )
                          )}
                        </div>
                      </div>
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
                🛒 Кошик · {cartCount} товарів · {cartTotal.toLocaleString('uk-UA')} грн
              </button>
            </div>
          )}
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
            { icon: '📦', label: 'Активні замовлення', desc: activeOrders.length > 0 ? `${activeOrders.length} замовлень` : 'Немає', view: 'active' as View, badge: activeOrders.length },
            { icon: '📋', label: 'Історія замовлень', desc: `${historyOrders.length} замовлень`, view: 'history' as View },
            { icon: '📜', label: 'Сертифікати', desc: 'Якість продукції', view: 'certificates' as View },
            { icon: '🧪', label: 'Як приготувати розчин?', desc: 'Інструкції', view: 'solution' as View },
            { icon: '👤', label: 'Моя інформація', desc: 'Адреса доставки', view: 'profile' as View },
          ].map(item => (
            <button key={item.view} onClick={() => setView(item.view)}
              className="relative flex flex-col items-start gap-2 bg-white rounded-2xl p-4 shadow-sm border border-[#F0F0F0]
                active:scale-[0.97] transition-all text-left">
              <span className="text-[28px]">{item.icon}</span>
              <div>
                <p className="text-[14px] font-bold text-[#111827] leading-tight">{item.label}</p>
                <p className="text-[11px] text-[#9CA3AF] mt-0.5">{item.desc}</p>
              </div>
              {item.badge && item.badge > 0 && (
                <span className="absolute top-3 right-3 min-w-[20px] h-[20px] rounded-full bg-[#EF4444] text-white text-[11px] font-bold flex items-center justify-center px-1">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Shop button */}
        <button onClick={() => { setView('shop'); loadCatalog(); }}
          className="w-full flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-[#F0F0F0] active:scale-[0.97] transition-all">
          <div className="flex items-center gap-3">
            <span className="text-[24px]">🛒</span>
            <div className="text-left">
              <p className="text-[15px] font-bold text-[#111827]">Магазин</p>
              <p className="text-[12px] text-[#9CA3AF]">Замовити з доставкою НП</p>
            </div>
          </div>
          {cartCount > 0 && (
            <span className="min-w-[24px] h-[24px] rounded-full bg-[#EF4444] text-white text-[12px] font-bold flex items-center justify-center px-1.5">
              {cartCount}
            </span>
          )}
          <svg className="w-5 h-5 text-[#C5C9D1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Links */}
        <div className="flex justify-center gap-6">
          <a href="https://dezik.com.ua" target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#4b569e] font-medium">dezik.com.ua</a>
          <a href="https://www.instagram.com/dezik_ua/" target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#4b569e] font-medium">Instagram</a>
        </div>

        <p className="text-center text-[12px] text-[#C5C9D1] pt-2">Dezik Ukraine · dezik.com.ua</p>
      </div>
    </div>
  );
}
