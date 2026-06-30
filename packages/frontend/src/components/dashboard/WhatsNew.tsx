import { useState, useEffect } from 'react';
import { HiOutlineChevronRight, HiOutlineSparkles, HiOutlineX } from 'react-icons/hi';
import { productUpdateAPI } from '../../utils/api';

interface ProductUpdate {
  id: string;
  title: string;
  description: string;
  icon: string;
  badge?: string | null;
  category: string;
  createdAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  ai_feature: 'from-amber-400 to-orange-500',
  new_template: 'from-purple-500 to-indigo-500',
  seasonal: 'from-green-400 to-emerald-500',
  team_feature: 'from-blue-500 to-cyan-500',
  product_update: 'from-pink-500 to-rose-500',
  maintenance: 'from-gray-400 to-gray-600',
};

export default function WhatsNew() {
  const [items, setItems] = useState<ProductUpdate[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadUpdates();
  }, []);

  const loadUpdates = async () => {
    try {
      const { data } = await productUpdateAPI.list();
      setItems(data);
    } catch {
      setItems([]);
    }
  };

  const visibleItems = items.filter((item) => !dismissed.includes(item.id));

  if (visibleItems.length === 0) return null;

  return (
    <div className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <HiOutlineSparkles size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">What's New</h3>
            <p className="text-xs text-gray-400">{items.length} updates</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-[400px] overflow-y-auto">
        {visibleItems.map((item) => (
          <div
            key={item.id}
            className="p-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer group"
            onClick={() => setExpanded(expanded === item.id ? null : item.id)}
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.product_update} flex items-center justify-center flex-shrink-0`}>
                <span className="text-lg">{item.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{item.title}</h4>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-[#7B2FBE] text-white rounded-full">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>
                {expanded === item.id && (
                  <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <p className="text-xs text-gray-600 dark:text-gray-300">{item.description}</p>
                    <p className="text-[10px] text-gray-400 mt-2">{new Date(item.createdAt).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setDismissed([...dismissed, item.id]); }}
                className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-all"
              >
                <HiOutlineX size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
