import { useEditorStore } from '../../stores/editorStore';
import { HiOutlineX } from 'react-icons/hi';
import LeftSidebar from './LeftSidebar';
import LayersListCompact from './LayersListCompact';
import ElementAnimations from './ElementAnimations';
import PageTransitions from './PageTransitions';
import SettingsModal from './SettingsModal';

export default function SidePanel() {
  const { sidePanelTab, setSidePanelTab, setLayersOpen } = useEditorStore();

  if (!sidePanelTab) return null;

  const closePanel = () => {
    setSidePanelTab('');
    setLayersOpen(false);
  };

  const getPanelTitle = () => {
    const titles: Record<string, string> = {
      templates: 'Templates',
      elements: 'Elements',
      text: 'Text',
      tools: 'Tools',
      uploads: 'Uploads',
      background: 'Background',
      ai: 'AI Design',
      layers: 'Layers',
      animations: 'Animations',
      transitions: 'Page Transition',
      settings: 'Settings',
    };
    return titles[sidePanelTab] || 'Panel';
  };

  return (
    // Below `lg`, this and RightPropertiesPanel are both fixed-width flex
    // siblings of the canvas that never shrink — on a narrow viewport (a phone,
    // or DevTools' responsive mode) their combined width exceeds the available
    // space, crushing the canvas to ~0px and clipping whichever panel comes last
    // in the flex row to an unreadable sliver. Below `lg` they instead become
    // absolutely-positioned overlays that sit on top of the canvas rather than
    // squeezing it — `absolute` pulls them out of the flex flow entirely, so the
    // canvas gets its normal full width back. `lg:` and up restores the original
    // side-by-side layout.
    <div className="absolute lg:relative inset-y-0 lg:inset-auto left-16 lg:left-auto z-30 lg:z-auto w-72 max-w-[calc(100vw-4rem)] bg-white dark:bg-canva-dark-surface border-r border-gray-200 dark:border-canva-dark-border flex flex-col overflow-hidden flex-shrink-0 shadow-xl lg:shadow-sm animate-slide-in-left">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{getPanelTitle()}</h3>
        <button
          onClick={closePanel}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="Close panel"
        >
          <HiOutlineX size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {['templates', 'elements', 'text', 'tools', 'uploads', 'background', 'ai'].includes(sidePanelTab) && (
          <LeftSidebar />
        )}
        {sidePanelTab === 'layers' && <div className="p-2"><LayersListCompact /></div>}
        {sidePanelTab === 'animations' && <div className="p-3"><ElementAnimations /></div>}
        {sidePanelTab === 'transitions' && <div className="p-3"><PageTransitions /></div>}
        {sidePanelTab === 'settings' && <div className="p-4"><SettingsModal open={true} onClose={closePanel} /></div>}
      </div>
    </div>
  );
}
