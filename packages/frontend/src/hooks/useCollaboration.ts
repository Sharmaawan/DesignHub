import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';
import { useEditorStore } from '../stores/editorStore';
import { useAuthStore } from '../stores/authStore';
import { CanvasElement } from '../types';

export interface Collaborator {
  id: string; // socket id
  name: string;
  avatar: string;
  color: string;
  cursor?: { x: number; y: number };
}

// Mirrors the event contract already implemented server-side in
// packages/backend/src/index.ts's `io.on('connection', ...)` block — this hook
// was previously dead code (unused, wrong URL, event names that didn't match
// the backend at all), so live collaboration never actually worked despite the
// server-side support being fully built.
export function useCollaboration(projectId: string | undefined) {
  const { user } = useAuthStore();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  // Suppresses re-broadcasting a change we just applied *because* it arrived
  // from a peer — without this, every incoming edit would immediately echo
  // back out as if it were a new local edit.
  const applyingRemoteRef = useRef(false);
  const prevElementsRef = useRef<Map<string, CanvasElement>>(new Map());
  const prevPageIndexRef = useRef<number>(-1);
  // -1 guarantees the subscribe callback's very first invocation always looks
  // like a generation change, so it re-baselines instead of diffing — see the
  // loadGeneration handling below and its comment in editorStore.ts.
  const prevLoadGenerationRef = useRef<number>(-1);

  useEffect(() => {
    if (!projectId || !user) return;
    const socket = getSocket();

    socket.emit('join-project', projectId, { id: user.id, name: user.name, avatar: user.avatar || '' });

    const onCollaborators = (list: Collaborator[]) => setCollaborators(list.filter((c) => c.id !== socket.id));
    const onUserJoined = (collab: Collaborator) => setCollaborators((prev) => [...prev.filter((c) => c.id !== collab.id), collab]);
    const onUserLeft = ({ id }: { id: string }) => setCollaborators((prev) => prev.filter((c) => c.id !== id));
    const onCursorUpdate = ({ id, cursor }: { id: string; cursor: { x: number; y: number }; color: string }) =>
      setCollaborators((prev) => prev.map((c) => (c.id === id ? { ...c, cursor } : c)));

    const applyRemote = (mutator: () => void) => {
      applyingRemoteRef.current = true;
      mutator();
      applyingRemoteRef.current = false;
    };

    const onElementChanged = ({ id, ...data }: { id: string } & Partial<CanvasElement>) => {
      applyRemote(() => useEditorStore.getState().updateElement(id, data));
    };
    const onElementAdded = ({ element }: { element: CanvasElement }) => {
      applyRemote(() => {
        const state = useEditorStore.getState();
        const idx = state.currentPageIndex;
        const pages = state.pages.map((p, i) => {
          if (i !== idx) return p;
          // Any full project reload (setProject) re-diffs every element on the
          // page against an empty baseline and broadcasts each one as "added"
          // — see the subscribe callback below. Without this check, a second
          // connected session (another tab, a collaborator, even a one-off
          // verification session opening the same project) would receive
          // those and blindly append duplicates of everything already there.
          if (p.elements.some((e) => e.id === element.id)) return p;
          return { ...p, elements: [...p.elements, element] };
        });
        useEditorStore.setState({ pages });
      });
    };
    const onElementDeleted = ({ elementId }: { elementId: string }) => {
      applyRemote(() => {
        const state = useEditorStore.getState();
        const idx = state.currentPageIndex;
        const pages = state.pages.map((p, i) => (i === idx ? { ...p, elements: p.elements.filter((e) => e.id !== elementId) } : p));
        useEditorStore.setState({ pages });
      });
    };
    const onPageChanged = ({ pageIndex }: { pageIndex: number }) => {
      applyRemote(() => useEditorStore.getState().setCurrentPage(pageIndex));
    };

    socket.on('collaborators', onCollaborators);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    socket.on('cursor-update', onCursorUpdate);
    socket.on('element-changed', onElementChanged);
    socket.on('element-added', onElementAdded);
    socket.on('element-deleted', onElementDeleted);
    socket.on('page-changed', onPageChanged);

    // Diff-based emit: rather than threading an emit call through every one of
    // the many call sites that add/update/delete elements across the editor,
    // watch the store and derive what changed — additions, per-id updates,
    // deletions, and page switches — and broadcast just those.
    const unsubscribe = useEditorStore.subscribe((state) => {
      if (applyingRemoteRef.current) return;

      // A bulk reload (setProject — the initial load, and every subsequent
      // one; see its comment in editorStore.ts) hands back all-new element
      // object references even when nothing actually changed. Diffing that
      // by reference would read as "every element just got added/updated"
      // and broadcast accordingly — re-baseline silently instead and only
      // start diffing real incremental edits from here.
      if (state.loadGeneration !== prevLoadGenerationRef.current) {
        prevLoadGenerationRef.current = state.loadGeneration;
        prevPageIndexRef.current = state.currentPageIndex;
        prevElementsRef.current = new Map(state.pages[state.currentPageIndex]?.elements.map((e) => [e.id, e]) || []);
        return;
      }

      if (state.currentPageIndex !== prevPageIndexRef.current) {
        prevPageIndexRef.current = state.currentPageIndex;
        prevElementsRef.current = new Map(state.pages[state.currentPageIndex]?.elements.map((e) => [e.id, e]) || []);
        socket.emit('page-change', projectId, state.currentPageIndex);
        return;
      }

      const page = state.pages[state.currentPageIndex];
      if (!page) return;
      const prev = prevElementsRef.current;
      const curr = new Map(page.elements.map((e) => [e.id, e]));

      for (const id of prev.keys()) {
        if (!curr.has(id)) socket.emit('element-delete', projectId, id);
      }
      for (const [id, el] of curr) {
        const before = prev.get(id);
        if (!before) socket.emit('element-add', projectId, el);
        else if (before !== el) socket.emit('element-update', projectId, el);
      }
      prevElementsRef.current = curr;
    });

    return () => {
      unsubscribe();
      socket.off('collaborators', onCollaborators);
      socket.off('user-joined', onUserJoined);
      socket.off('user-left', onUserLeft);
      socket.off('cursor-update', onCursorUpdate);
      socket.off('element-changed', onElementChanged);
      socket.off('element-added', onElementAdded);
      socket.off('element-deleted', onElementDeleted);
      socket.off('page-changed', onPageChanged);
      setCollaborators([]);
    };
  }, [projectId, user]);

  const emitCursorMove = (x: number, y: number) => {
    if (!projectId) return;
    getSocket().emit('cursor-move', projectId, { x, y });
  };

  return { collaborators, emitCursorMove };
}
