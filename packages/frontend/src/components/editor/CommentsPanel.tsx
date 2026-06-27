import { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useAuthStore } from '../../stores/authStore';
import { HiOutlineX, HiOutlineCheck, HiOutlineReply, HiOutlineTrash, HiOutlineChat } from 'react-icons/hi';
import { Comment, CommentReply } from '../../types';

const DEMO_USERS = [
  { id: '1', name: 'You', email: 'you@email.com', avatar: '' },
  { id: '2', name: 'Sarah Chen', email: 'sarah@team.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah' },
  { id: '3', name: 'Mike Johnson', email: 'mike@team.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike' },
  { id: '4', name: 'Alex Rivera', email: 'alex@team.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex' },
];

export default function CommentsPanel() {
  const { setCommentsOpen, pages, currentPageIndex } = useEditorStore();
  const { user } = useAuthStore();
  const [comments, setComments] = useState<Comment[]>([
    {
      id: 'c1', projectId: '', pageId: 'p1', userId: '2', userName: 'Sarah Chen',
      userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
      content: 'This heading looks great! Maybe try a slightly larger font size? @Mike Johnson',
      x: 200, y: 100, resolved: false, replies: [
        { id: 'r1', userId: '1', userName: 'You', content: 'Good idea, updated!', createdAt: new Date().toISOString() },
      ],
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'c2', projectId: '', pageId: 'p1', userId: '3', userName: 'Mike Johnson',
      userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',
      content: 'Love the color scheme! Perfect for the brand.',
      x: 400, y: 300, resolved: false, replies: [],
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'c3', projectId: '', pageId: 'p1', userId: '4', userName: 'Alex Rivera',
      userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
      content: 'Can we add a logo here?',
      x: 600, y: 400, resolved: true, replies: [
        { id: 'r2', userId: '1', userName: 'You', content: 'Done!', createdAt: new Date().toISOString() },
      ],
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  const currentPageId = pages[currentPageIndex]?.id || '';
  const pageComments = comments.filter((c) => c.pageId === currentPageId || !c.pageId);
  const unresolvedComments = pageComments.filter((c) => !c.resolved);
  const resolvedComments = pageComments.filter((c) => c.resolved);
  const displayComments = showResolved ? resolvedComments : unresolvedComments;

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    const comment: Comment = {
      id: Date.now().toString(),
      projectId: '',
      pageId: currentPageId,
      userId: user?.id || '1',
      userName: user?.name || 'You',
      userAvatar: user?.avatar,
      content: newComment,
      x: Math.round(Math.random() * 500 + 100),
      y: Math.round(Math.random() * 300 + 100),
      resolved: false,
      replies: [],
      createdAt: new Date().toISOString(),
    };
    setComments([comment, ...comments]);
    setNewComment('');
    setShowMentions(false);
  };

  const handleReply = (commentId: string) => {
    if (!replyText.trim()) return;
    setComments(comments.map((c) =>
      c.id === commentId
        ? {
            ...c,
            replies: [...c.replies, {
              id: Date.now().toString(),
              userId: user?.id || '1',
              userName: user?.name || 'You',
              userAvatar: user?.avatar,
              content: replyText,
              createdAt: new Date().toISOString(),
            }],
          }
        : c
    ));
    setReplyText('');
    setReplyTo(null);
  };

  const handleResolve = (commentId: string) => {
    setComments(comments.map((c) =>
      c.id === commentId ? { ...c, resolved: !c.resolved } : c
    ));
  };

  const handleDelete = (commentId: string) => {
    setComments(comments.filter((c) => c.id !== commentId));
  };

  const insertMention = (name: string) => {
    setNewComment((prev) => prev + `@${name} `);
    setShowMentions(false);
    commentInputRef.current?.focus();
  };

  const filteredUsers = DEMO_USERS.filter(
    (u) => u.id !== user?.id && u.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const highlightMentions = (text: string) => {
    return text.replace(/@(\w+\s?\w*)/g, '<span class="text-canva-purple font-medium">@$1</span>');
  };

  return (
    <div className="w-80 bg-white dark:bg-canva-dark-surface border-l border-gray-200 dark:border-canva-dark-border flex flex-col h-full flex-shrink-0">
      <div className="sticky top-0 z-10 bg-white dark:bg-canva-dark-surface border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Comments</h3>
        <button onClick={() => setCommentsOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><HiOutlineX size={16} /></button>
      </div>

      {/* Add comment */}
      <div className="p-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex gap-2">
          <img src={user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} alt="" className="w-7 h-7 rounded-full flex-shrink-0 bg-gray-200" />
          <div className="flex-1 relative">
            <textarea
              ref={commentInputRef}
              value={newComment}
              onChange={(e) => {
                setNewComment(e.target.value);
                const lastAt = e.target.value.lastIndexOf('@');
                if (lastAt !== -1 && lastAt === e.target.value.length - 1) {
                  setShowMentions(true);
                  setMentionFilter('');
                } else if (lastAt !== -1) {
                  const afterAt = e.target.value.substring(lastAt + 1);
                  if (!afterAt.includes(' ') || afterAt.split(' ').length < 2) {
                    setShowMentions(true);
                    setMentionFilter(afterAt);
                  } else {
                    setShowMentions(false);
                  }
                } else {
                  setShowMentions(false);
                }
              }}
              placeholder="Add a comment... Type @ to mention"
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-canva-purple/30 text-gray-900 dark:text-white placeholder-gray-400"
              rows={2}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment(); }}
            />
            {/* Mention dropdown */}
            {showMentions && filteredUsers.length > 0 && (
              <div className="absolute left-0 right-0 bottom-full mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-10">
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => insertMention(u.name)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <img src={u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`} alt="" className="w-5 h-5 rounded-full" />
                    {u.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center mt-1.5">
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowMentions(!showMentions); setMentionFilter(''); commentInputRef.current?.focus(); }} className="text-gray-400 hover:text-canva-purple transition-colors" title="Mention someone">
                  <HiOutlineChat size={16} />
                </button>
                <span className="text-[10px] text-gray-400">Ctrl+Enter to send</span>
              </div>
              <button onClick={handleAddComment} disabled={!newComment.trim()} className="px-3 py-1 bg-canva-purple text-white text-xs rounded-lg font-medium hover:bg-canva-purple-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-800">
        <button onClick={() => setShowResolved(false)} className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${!showResolved ? 'border-canva-purple text-canva-purple' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          Open ({unresolvedComments.length})
        </button>
        <button onClick={() => setShowResolved(true)} className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${showResolved ? 'border-canva-purple text-canva-purple' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          Resolved ({resolvedComments.length})
        </button>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto">
        {displayComments.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">{showResolved ? '✅' : '💬'}</div>
            <p className="text-sm text-gray-400">No {showResolved ? 'resolved' : 'open'} comments</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {displayComments.map((comment) => (
              <div key={comment.id} className="p-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-start gap-2.5">
                  <img src={comment.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.userName}`} alt="" className="w-7 h-7 rounded-full flex-shrink-0 bg-gray-200" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{comment.userName}</span>
                      <span className="text-[10px] text-gray-400">{new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed" dangerouslySetInnerHTML={{ __html: highlightMentions(comment.content) }} />

                    {comment.replies.length > 0 && (
                      <div className="mt-2 ml-2 pl-2 border-l-2 border-gray-100 dark:border-gray-700 space-y-2">
                        {comment.replies.map((reply) => (
                          <div key={reply.id} className="flex items-start gap-2">
                            <img src={reply.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${reply.userName}`} alt="" className="w-5 h-5 rounded-full flex-shrink-0 bg-gray-200" />
                            <div>
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{reply.userName}</span>
                              <p className="text-xs text-gray-600 dark:text-gray-400" dangerouslySetInnerHTML={{ __html: highlightMentions(reply.content) }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1 mt-2">
                      <button onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)} className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors">
                        <HiOutlineReply size={12} /> Reply
                      </button>
                      <button onClick={() => handleResolve(comment.id)} className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-green-600 rounded transition-colors">
                        <HiOutlineCheck size={12} /> {comment.resolved ? 'Reopen' : 'Resolve'}
                      </button>
                      <button onClick={() => handleDelete(comment.id)} className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-red-600 rounded transition-colors">
                        <HiOutlineTrash size={12} /> Delete
                      </button>
                    </div>

                    {replyTo === comment.id && (
                      <div className="mt-2 flex gap-2">
                        <input
                          ref={replyInputRef}
                          autoFocus
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Reply... (use @ to mention)"
                          className="flex-1 px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-canva-purple text-gray-900 dark:text-white"
                          onKeyDown={(e) => { if (e.key === 'Enter') handleReply(comment.id); if (e.key === 'Escape') setReplyTo(null); }}
                        />
                        <button onClick={() => handleReply(comment.id)} className="px-2 py-1 bg-canva-purple text-white text-xs rounded-lg">Reply</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
