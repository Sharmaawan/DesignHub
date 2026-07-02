import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBrandStore } from '../stores/brandStore';
import { useNotificationStore } from '../stores/notificationStore';
import { uploadAPI } from '../utils/api';
import DashboardSidebar from '../components/dashboard/DashboardSidebar';
import CreateButton from '../components/dashboard/CreateButton';
import NotificationCenter from '../components/dashboard/NotificationCenter';
import {
  HiOutlineBell, HiOutlinePlus, HiOutlineTrash, HiOutlineCheck,
  HiOutlineUpload, HiOutlinePhotograph, HiOutlineColorSwatch,
  HiOutlinePencilAlt, HiOutlineTemplate, HiOutlineStar, HiOutlineX,
  HiOutlineSearch, HiOutlineDocumentText,
} from 'react-icons/hi';
import toast from 'react-hot-toast';

const FONT_FAMILIES = [
  'Inter', 'Plus Jakarta Sans', 'Playfair Display', 'Montserrat', 'Poppins',
  'Raleway', 'Oswald', 'Roboto Slab', 'Lato', 'Open Sans', 'Nunito', 'Fira Sans',
];

export default function BrandHubPage() {
  const navigate = useNavigate();
  const { logos, colors, fonts, images, activeTab, setActiveTab, addLogo, removeLogo, setDefaultLogo, addColor, removeColor, addFont, removeFont, setDefaultFont, addImage, removeImage, loadAll, isLoading } = useBrandStore();
  const { unreadCount, setIsOpen: setNotifOpen } = useNotificationStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('designhub-sidebar-collapsed') === 'true');
  const [activeSection, setActiveSection] = useState('brand');

  const [showAddColor, setShowAddColor] = useState(false);
  const [newColorHex, setNewColorHex] = useState('#7B2FBE');
  const [newColorName, setNewColorName] = useState('');
  const [showAddFont, setShowAddFont] = useState(false);
  const [newFontName, setNewFontName] = useState('Inter');
  const [newFontType, setNewFontType] = useState<'heading' | 'body' | 'accent'>('heading');
  const [searchQuery, setSearchQuery] = useState('');

  const logoInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const tabs = [
    { id: 'logos' as const, label: 'Logos', icon: HiOutlinePhotograph, count: logos.length },
    { id: 'colors' as const, label: 'Colors', icon: HiOutlineColorSwatch, count: colors.length },
    { id: 'fonts' as const, label: 'Fonts', icon: HiOutlineDocumentText, count: fonts.length },
    { id: 'templates' as const, label: 'Templates', icon: HiOutlineTemplate, count: 0 },
    { id: 'images' as const, label: 'Images', icon: HiOutlinePhotograph, count: images.length },
  ];

  // Upload the actual file (multipart, same endpoint every other file upload in this app
  // uses) and store just the short returned URL — not a base64 data URL. Embedding the
  // whole image as base64 directly in JSON is what caused uploads to fail: it produces a
  // multi-KB/MB string that overflows what the database column was built to hold.
  const BACKEND = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { data: saved } = await uploadAPI.upload(file);
      const url = `${BACKEND}${saved.url}`;
      await addLogo({ name: file.name, url, isDefault: logos.length === 0 });
      toast.success('Logo uploaded');
    } catch (err: any) {
      console.error('[BrandHub] logo upload failed', err);
      toast.error(err.response?.data?.error || err.message || 'Failed to upload logo');
    }
    e.target.value = '';
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { data: saved } = await uploadAPI.upload(file);
      const url = `${BACKEND}${saved.url}`;
      await addImage({ name: file.name, url, folder: 'Brand Assets' });
      toast.success('Image uploaded');
    } catch (err: any) {
      console.error('[BrandHub] image upload failed', err);
      toast.error(err.response?.data?.error || err.message || 'Failed to upload image');
    }
    e.target.value = '';
  };

  const handleAddColor = async () => {
    if (!newColorHex || !newColorName.trim()) return;
    try {
      await addColor({ hex: newColorHex, name: newColorName.trim() });
      setNewColorName('');
      setNewColorHex('#7B2FBE');
      setShowAddColor(false);
      toast.success('Color added');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddFont = async () => {
    if (!newFontName) return;
    try {
      await addFont({ name: newFontName, type: newFontType, isDefault: false });
      setShowAddFont(false);
      toast.success('Font added');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filteredFonts = FONT_FAMILIES.filter((f) => !searchQuery || f.toLowerCase().includes(searchQuery.toLowerCase()));

  const renderEmptyState = (icon: string, title: string, description: string, action?: () => void, actionLabel?: string) => (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">{description}</p>
      {action && actionLabel && (
        <button onClick={action} className="px-5 py-2.5 bg-[#7B2FBE] text-white rounded-xl font-medium text-sm hover:bg-[#6A25A8] transition-colors">
          {actionLabel}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#111127] transition-colors">
      <DashboardSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} activeSection={activeSection} onSectionChange={setActiveSection} />

      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-[72px]' : 'ml-[240px]'}`}>
        <header className="sticky top-0 z-30 bg-gray-50/80 dark:bg-[#111127]/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50">
          <div className="flex items-center justify-between px-6 h-16">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Brand Hub</h2>
            <div className="flex items-center gap-3">
              <CreateButton />
              <button onClick={() => setNotifOpen(true)} className="relative p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500">
                <HiOutlineBell size={20} />
                {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full">{unreadCount}</span>}
              </button>
            </div>
          </div>
        </header>

        <main className="px-6 py-8 max-w-[1200px] mx-auto">
          {/* Brand summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Logos', value: logos.length, icon: '🎨', color: 'from-purple-500 to-indigo-500' },
              { label: 'Colors', value: colors.length, icon: '🎯', color: 'from-pink-500 to-rose-500' },
              { label: 'Fonts', value: fonts.length, icon: '✏️', color: 'from-blue-500 to-cyan-500' },
              { label: 'Images', value: images.length, icon: '🖼️', color: 'from-green-500 to-emerald-500' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-lg`}>{stat.icon}</div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                    <p className="text-xs text-gray-400">{stat.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 overflow-x-auto no-scrollbar pb-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? 'bg-[#7B2FBE] text-white shadow-md shadow-[#7B2FBE]/30'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${activeTab === tab.id ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'}`}>{tab.count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Logos Tab */}
          {activeTab === 'logos' && (
            <div>
              {logos.length === 0 ? (
                renderEmptyState('🎨', 'Upload your first logo', 'Add your brand logo to make it available across all your designs.', () => logoInputRef.current?.click(), 'Upload logo')
              ) : (
                <>
                  <div className="flex justify-end mb-4">
                    <button onClick={() => logoInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-[#7B2FBE] text-white rounded-xl text-sm font-medium hover:bg-[#6A25A8] transition-colors">
                      <HiOutlineUpload size={16} /> Upload logo
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {logos.map((logo) => (
                      <div key={logo.id} className="group bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-4 relative">
                        <img src={logo.url} alt={logo.name} className="w-full h-24 object-contain mb-2" />
                        <p className="text-xs text-gray-500 truncate">{logo.name}</p>
                        {logo.isDefault && <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold bg-[#7B2FBE] text-white rounded-full">DEFAULT</span>}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 rounded-2xl transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          {!logo.isDefault && (
                            <button onClick={async () => { await setDefaultLogo(logo.id); toast.success('Set as default'); }} className="p-2 bg-white rounded-lg text-gray-700 hover:text-[#7B2FBE] text-xs font-medium shadow">Default</button>
                          )}
                          <button onClick={async () => { await removeLogo(logo.id); toast.success('Logo removed'); }} className="p-2 bg-white rounded-lg text-red-600 shadow"><HiOutlineTrash size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          )}

          {/* Colors Tab */}
          {activeTab === 'colors' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => setShowAddColor(true)} className="flex items-center gap-2 px-4 py-2 bg-[#7B2FBE] text-white rounded-xl text-sm font-medium hover:bg-[#6A25A8] transition-colors">
                  <HiOutlinePlus size={16} /> Add color
                </button>
              </div>

              {showAddColor && (
                <div className="mb-6 bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Add brand color</h4>
                    <button onClick={() => setShowAddColor(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><HiOutlineX size={16} /></button>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Color</label>
                      <input type="color" value={newColorHex} onChange={(e) => setNewColorHex(e.target.value)} className="w-12 h-12 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-400 mb-1 block">Name</label>
                      <input type="text" value={newColorName} onChange={(e) => setNewColorName(e.target.value)} placeholder="e.g. Primary Blue" className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white" />
                    </div>
                    <div className="flex items-end">
                      <button onClick={handleAddColor} disabled={!newColorName.trim()} className="px-4 py-2 bg-[#7B2FBE] text-white rounded-lg text-sm font-medium hover:bg-[#6A25A8] disabled:opacity-50 transition-colors">Add</button>
                    </div>
                  </div>
                </div>
              )}

              {colors.length === 0 ? (
                renderEmptyState('🎯', 'Add your first brand color', 'Define your brand colors to maintain consistency across all designs.', () => setShowAddColor(true), 'Add color')
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {colors.map((color) => (
                    <div key={color.id} className="group bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="h-24 w-full" style={{ backgroundColor: color.hex }} />
                      <div className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-gray-900 dark:text-white">{color.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{color.hex}</p>
                        </div>
                        <button onClick={async () => { await removeColor(color.id); toast.success('Color removed'); }} className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-all">
                          <HiOutlineTrash size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fonts Tab */}
          {activeTab === 'fonts' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => setShowAddFont(true)} className="flex items-center gap-2 px-4 py-2 bg-[#7B2FBE] text-white rounded-xl text-sm font-medium hover:bg-[#6A25A8] transition-colors">
                  <HiOutlinePlus size={16} /> Add font
                </button>
              </div>

              {showAddFont && (
                <div className="mb-6 bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Add brand font</h4>
                    <button onClick={() => setShowAddFont(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><HiOutlineX size={16} /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-400 mb-1 block">Font Family</label>
                      <select value={newFontName} onChange={(e) => setNewFontName(e.target.value)} className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white">
                        {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Type</label>
                      <select value={newFontType} onChange={(e) => setNewFontType(e.target.value as any)} className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white">
                        <option value="heading">Heading</option>
                        <option value="body">Body</option>
                        <option value="accent">Accent</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button onClick={handleAddFont} className="px-4 py-2 bg-[#7B2FBE] text-white rounded-lg text-sm font-medium hover:bg-[#6A25A8] transition-colors">Add font</button>
                  </div>
                </div>
              )}

              {fonts.length === 0 ? (
                renderEmptyState('✏️', 'Add your first brand font', 'Choose heading and body fonts to keep your designs consistent.', () => setShowAddFont(true), 'Add font')
              ) : (
                <div className="space-y-3">
                  {fonts.map((font) => (
                    <div key={font.id} className="group flex items-center justify-between bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          <span className="text-lg font-bold text-[#7B2FBE]">Aa</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white" style={{ fontFamily: font.name }}>{font.name}</p>
                          <p className="text-[11px] text-gray-400 capitalize">{font.type} font {font.isDefault ? '· Default' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {font.isDefault && <span className="px-2 py-1 text-[10px] font-bold bg-[#7B2FBE]/10 text-[#7B2FBE] rounded-full">DEFAULT</span>}
                        {!font.isDefault && (
                          <button onClick={async () => { await setDefaultFont(font.id); toast.success('Set as default'); }} className="text-[11px] text-gray-400 hover:text-[#7B2FBE] transition-colors">Set default</button>
                        )}
                        <button onClick={async () => { await removeFont(font.id); toast.success('Font removed'); }} className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-all">
                          <HiOutlineTrash size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div>
              {renderEmptyState('📋', 'No brand templates yet', 'Save your designs as brand templates to reuse them across your team. Create a design and save it as a template to get started.')}
            </div>
          )}

          {/* Images Tab */}
          {activeTab === 'images' && (
            <div>
              {images.length === 0 ? (
                renderEmptyState('🖼️', 'Upload your first brand image', 'Add approved images, illustrations, and assets for your team to use.', () => imageInputRef.current?.click(), 'Upload image')
              ) : (
                <>
                  <div className="flex justify-end mb-4">
                    <button onClick={() => imageInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-[#7B2FBE] text-white rounded-xl text-sm font-medium hover:bg-[#6A25A8] transition-colors">
                      <HiOutlineUpload size={16} /> Upload image
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {images.map((image) => (
                      <div key={image.id} className="group bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="aspect-square relative">
                          <img src={image.url} alt={image.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <button onClick={async () => { await removeImage(image.id); toast.success('Image removed'); }} className="p-2 bg-white rounded-lg text-red-600 shadow"><HiOutlineTrash size={14} /></button>
                          </div>
                        </div>
                        <div className="p-2">
                          <p className="text-xs text-gray-500 truncate">{image.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>
          )}
        </main>
      </div>

      <NotificationCenter />
    </div>
  );
}
