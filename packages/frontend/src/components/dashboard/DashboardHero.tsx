import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineUpload, HiOutlineSparkles, HiOutlineTemplate } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import { projectAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import MakeEditableModal from './MakeEditableModal';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Purely decorative floating cards — fixed gradients + a dicebear avatar
// each, not tied to the user's own real templates/projects. Showing their
// actual designs here read as if we'd picked one of their uploads to show
// off; these are just generic filler art for the hero, same idea as the
// small avatar chip pattern already used elsewhere in the app.
const FLOATING_CARDS = [
  { seed: 'hero-card-1', gradient: 'from-violet-500 to-purple-600', rotate: -8, top: '10%', left: '0%' },
  { seed: 'hero-card-2', gradient: 'from-amber-400 to-orange-500', rotate: -2, top: '0%', left: '55%' },
  { seed: 'hero-card-3', gradient: 'from-sky-400 to-blue-500', rotate: 4, top: '28%', left: '38%' },
];

export default function DashboardHero() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleStartFromScratch = async () => {
    const pages = [{
      id: `page-${Date.now()}`, name: 'Page 1', elements: [],
      backgroundColor: '#FFFFFF', width: 1080, height: 1080,
    }];
    try {
      const { data } = await projectAPI.create({ name: 'Untitled Design', canvasData: pages });
      navigate(`/editor/${data.id}`);
    } catch {
      toast.error('Failed to create design');
    }
  };

  // Picking a file no longer changes anything by itself — it opens a preview where
  // the user chooses Make Editable or Use as Background.
  const handleUploadFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) setPendingFile(file);
    };
    input.click();
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#F3E8FF] via-[#FAF5FF] to-white dark:from-[#2A1B45] dark:via-[#211735] dark:to-[#1a1a2e] border border-[#EDE4FB] dark:border-gray-800 animate-fade-in">
      <div className="relative flex flex-col lg:flex-row items-center gap-8 px-6 sm:px-10 py-10 lg:py-12">
        {/* Left: greeting + actions */}
        <div className="flex-1 min-w-0 text-center lg:text-left animate-slide-up">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white leading-tight">
            {getGreeting()},<br className="hidden sm:block" /> {user?.name?.split(' ')[0] || 'Designer'} <span aria-hidden="true" className="inline-block animate-gentle-bounce">👋</span>
          </h1>
          <p className="mt-3 text-gray-500 dark:text-gray-400 text-base max-w-md mx-auto lg:mx-0">
            Create designs that make an impact.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center lg:justify-start gap-3">
            <button
              onClick={handleUploadFile}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-[#7B2FBE] hover:text-[#7B2FBE] shadow-sm hover:shadow-md transition-all"
            >
              <HiOutlineUpload size={17} />
              Upload a file
            </button>
            <button
              onClick={handleStartFromScratch}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7B2FBE] text-white text-sm font-semibold shadow-md shadow-[#7B2FBE]/25 hover:bg-[#6025A0] hover:shadow-lg transition-all"
            >
              <HiOutlineSparkles size={17} />
              Start from scratch
            </button>
            <button
              onClick={() => navigate('/templates')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-800/60 transition-all"
            >
              <HiOutlineTemplate size={17} />
              Explore templates
            </button>
          </div>
        </div>

        {/* Right: floating decorative cards — generic gradient art + avatar,
            not the user's own designs (see FLOATING_CARDS above). */}
        <div className="hidden lg:flex items-center justify-center flex-shrink-0 w-64 h-48 relative">
          {FLOATING_CARDS.map((card, i) => (
            <div
              key={card.seed}
              onClick={() => navigate('/templates')}
              className={`hero-float-card absolute w-28 h-36 rounded-xl overflow-hidden shadow-lg border-4 border-white dark:border-gray-800 cursor-pointer hover:z-10 bg-gradient-to-br ${card.gradient}`}
              style={{
                top: card.top, left: card.left,
                zIndex: FLOATING_CARDS.length - i,
                ['--card-rotate' as any]: `${card.rotate}deg`,
                animationDelay: `${i * 0.12}s, ${i * 0.12 + 0.5}s`,
              }}
            >
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${card.seed}`}
                alt=""
                className="absolute inset-0 m-auto w-16 h-16 rounded-full border-2 border-white/80 shadow-sm bg-white"
              />
            </div>
          ))}
        </div>
      </div>
      {pendingFile && <MakeEditableModal file={pendingFile} onClose={() => setPendingFile(null)} />}
    </div>
  );
}
