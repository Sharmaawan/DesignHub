import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import {
  HiOutlineTemplate, HiOutlineViewGrid, HiOutlinePencil, HiOutlinePencilAlt,
  HiOutlineUpload, HiOutlineColorSwatch, HiOutlineSparkles,
  HiOutlineCog, HiOutlineChevronRight, HiOutlineViewList,
  HiOutlineFilm,
} from 'react-icons/hi';

type NavItem = 'templates' | 'elements' | 'text' | 'tools' | 'uploads' | 'background' | 'ai' | 'layers' | 'animations' | 'transitions' | 'settings';

interface NavConfig {
  id: NavItem;
  icon: React.ElementType;
  label: string;
  tooltip: string;
}

const NAV_ITEMS: NavConfig[] = [
  { id: 'templates', icon: HiOutlineTemplate, label: 'Templates', tooltip: 'Browse templates' },
  { id: 'elements', icon: HiOutlineViewGrid, label: 'Elements', tooltip: 'Shapes & elements' },
  { id: 'text', icon: HiOutlinePencil, label: 'Text', tooltip: 'Add text' },
  { id: 'tools', icon: HiOutlinePencilAlt, label: 'Tools', tooltip: 'Drawing tools' },
  { id: 'uploads', icon: HiOutlineUpload, label: 'Uploads', tooltip: 'Your uploads' },
  { id: 'background', icon: HiOutlineColorSwatch, label: 'Background', tooltip: 'Background' },
  { id: 'ai', icon: HiOutlineSparkles, label: 'AI', tooltip: 'AI assistant' },
  { id: 'layers', icon: HiOutlineViewList, label: 'Layers', tooltip: 'Layers & order' },
  { id: 'animations', icon: HiOutlineFilm, label: 'Animations', tooltip: 'Animations' },
  { id: 'settings', icon: HiOutlineCog, label: 'Settings', tooltip: 'Settings' },
];

export default function IconNavigation() {
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);
  const { setSidePanelTab, sidePanelTab } = useEditorStore();

  // sidePanelTab (shared store state) is the single source of truth for which
  // nav item is active — this used to also track its own local `activeNav`
  // state, defaulting to 'elements'. Anything that opened a panel by setting
  // sidePanelTab directly (rather than through this component's click
  // handler) left that stale local default highlighted alongside the real
  // active tab, so two icons lit up purple at once.
  const handleNavClick = (id: NavItem) => {
    setSidePanelTab(sidePanelTab === id ? '' : id);
  };

  return (
    <div className="w-16 bg-white dark:bg-canva-dark-surface border-r border-gray-200 dark:border-canva-dark-border flex flex-col items-center py-3 gap-1 flex-shrink-0">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = sidePanelTab === item.id;

        return (
          <div key={item.id} className="relative group">
            <button
              onClick={() => handleNavClick(item.id)}
              className={`w-12 h-12 rounded-lg flex items-center justify-center transition-smooth transform ${
                isActive
                  ? 'bg-canva-purple text-white shadow-lg scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:scale-110'
              }`}
              title={item.tooltip}
            >
              <Icon size={20} />
              {isActive && <HiOutlineChevronRight size={16} className="absolute -right-1 text-canva-purple dark:text-canva-purple animate-fade-in" />}
            </button>

            {/* Tooltip */}
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 dark:bg-gray-950 text-white text-xs rounded whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-smooth z-50">
              {item.tooltip}
            </div>
          </div>
        );
      })}
    </div>
  );
}
