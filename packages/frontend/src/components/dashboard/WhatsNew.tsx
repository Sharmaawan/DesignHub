import { useState } from 'react';
import { HiOutlineChevronRight, HiOutlineSparkles, HiOutlineX } from 'react-icons/hi';
import { WhatsNewItem } from '../../types';

const WHATS_NEW_ITEMS: WhatsNewItem[] = [
  {
    id: 'wn-1', title: 'Magic Design AI', description: 'Generate complete designs from a text prompt. Just describe what you need!',
    category: 'ai_feature', badge: 'NEW', publishedAt: new Date().toISOString(), isActive: true,
  },
  {
    id: 'wn-2', title: '2024 Holiday Templates', description: 'Explore our curated collection of seasonal templates for Christmas, New Year, and more.',
    category: 'seasonal', badge: 'SEASONAL', publishedAt: new Date().toISOString(), isActive: true,
  },
  {
    id: 'wn-3', title: 'Real-time Collaboration', description: 'Work together with your team in real-time. See cursors and edits live!',
    category: 'team_feature', publishedAt: new Date().toISOString(), isActive: true,
  },
  {
    id: 'wn-4', title: 'Brand Kit Integration', description: 'Upload your brand colors, fonts, and logos for consistent designs across your team.',
    category: 'product_update', publishedAt: new Date().toISOString(), isActive: true,
  },
  {
    id: 'wn-5', title: 'Background Remover 2.0', description: 'Our AI-powered background remover is now 3x faster with better edge detection.',
    category: 'ai_feature', badge: 'UPDATED', publishedAt: new Date().toISOString(), isActive: true,
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  ai_feature: 'from-amber-400 to-orange-500',
  new_template: 'from-purple-500 to-indigo-500',
  seasonal: 'from-green-400 to-emerald-500',
  team_feature: 'from-blue-500 to-cyan-500',
  product_update: 'from-pink-500 to-rose-500',
};

const CATEGORY_ICONS: Record<string, string> = {
  ai_feature: '✨',
  new_template: '🎨',
  seasonal: '🎄',
  team_feature: '👥',
  product_update: '🚀',
};

export default function WhatsNew() {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const visibleItems = WHATS_NEW_ITEMS.filter((item) => !dismissed.includes(item.id));

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
            <p className="text-xs text-gray-400">Latest updates and features</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-50 dark:divide-gray-800">
        {visibleItems.map((item) => (
          <div
            key={item.id}
            className="p-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer group"
            onClick={() => setExpanded(expanded === item.id ? null : item.id)}
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${CATEGORY_COLORS[item.category]} flex items-center justify-center flex-shrink-0`}>
                <span className="text-lg">{CATEGORY_ICONS[item.category]}</span>
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
                    <button className="mt-2 text-xs font-medium text-[#7B2FBE] hover:underline flex items-center gap-1">
                      Learn more <HiOutlineChevronRight size={12} />
                    </button>
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
