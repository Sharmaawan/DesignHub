import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useAuthStore } from '../../stores/authStore';
import { HiOutlineX, HiOutlineRefresh, HiOutlineCheck } from 'react-icons/hi';
import { Version } from '../../types';

const DEMO_VERSIONS: Version[] = [
  {
    id: 'v1', projectId: '', name: 'Current version',
    createdBy: '1', createdAt: new Date().toISOString(),
    data: { id: 'v1', name: 'Current', pages: [], ownerId: '', collaborators: [], isFavorite: false, isTemplate: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  },
  {
    id: 'v2', projectId: '', name: 'After color update',
    createdBy: '1', createdAt: new Date(Date.now() - 3600000).toISOString(),
    data: { id: 'v2', name: 'Color Update', pages: [], ownerId: '', collaborators: [], isFavorite: false, isTemplate: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  },
  {
    id: 'v3', projectId: '', name: 'Initial design',
    createdBy: '2', createdAt: new Date(Date.now() - 86400000).toISOString(),
    data: { id: 'v3', name: 'Initial', pages: [], ownerId: '', collaborators: [], isFavorite: false, isTemplate: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  },
  {
    id: 'v4', projectId: '', name: 'Template applied',
    createdBy: '1', createdAt: new Date(Date.now() - 172800000).toISOString(),
    data: { id: 'v4', name: 'Template', pages: [], ownerId: '', collaborators: [], isFavorite: false, isTemplate: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  },
];

export default function VersionHistory() {
  const { setVersionsOpen } = useEditorStore();
  const { user } = useAuthStore();
  const [versions] = useState(DEMO_VERSIONS);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  const handleRestore = (versionId: string) => {
    // In production, this would restore the version
    alert(`Version ${versionId} would be restored!`);
    setVersionsOpen(false);
  };

  return (
    <div className="w-80 bg-white dark:bg-canva-dark-surface border-l border-gray-200 dark:border-canva-dark-border flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-white dark:bg-canva-dark-surface border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Version History</h3>
        <button onClick={() => setVersionsOpen(false)} className="toolbar-btn">
          <HiOutlineX size={16} />
        </button>
      </div>

      <div className="p-3 border-b border-gray-100 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Versions are automatically saved every 5 minutes
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {versions.map((version, index) => {
          const isCurrentUser = version.createdBy === user?.id;
          const isSelected = selectedVersion === version.id;

          return (
            <div
              key={version.id}
              className={`p-3 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${
                isSelected ? 'bg-canva-purple/5 dark:bg-canva-purple/10' : ''
              }`}
              onClick={() => setSelectedVersion(version.id)}
            >
              <div className="flex items-start gap-3">
                {/* Timeline dot */}
                <div className="flex flex-col items-center mt-1">
                  <div className={`w-3 h-3 rounded-full ${
                    index === 0
                      ? 'bg-canva-purple ring-2 ring-canva-purple/20'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`} />
                  {index < versions.length - 1 && (
                    <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mt-1" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{version.name}</span>
                    {index === 0 && (
                      <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-medium rounded">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {isCurrentUser ? 'You' : version.createdBy === '2' ? 'Sarah Chen' : 'Unknown'} · {new Date(version.createdAt).toLocaleString([], {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>

                  {isSelected && index > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRestore(version.id); }}
                      className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-canva-purple text-white text-xs rounded-lg font-medium hover:bg-canva-purple-dark transition-colors"
                    >
                      <HiOutlineRefresh size={12} />
                      Restore this version
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-gray-100 dark:border-gray-800">
        <p className="text-[10px] text-gray-400 text-center">
          Showing last {versions.length} versions
        </p>
      </div>
    </div>
  );
}
