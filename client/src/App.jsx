import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken, setToken } from './api';
import Auth from './components/Auth';
import Camera from './components/Camera';
import Editor from './components/Editor';
import SendTo from './components/SendTo';
import ChatList from './components/ChatList';
import Chat from './components/Chat';
import SnapViewer from './components/SnapViewer';
import Stories from './components/Stories';
import StoryViewer from './components/StoryViewer';
import Friends from './components/Friends';
import Settings from './components/Settings';
import { addToOutbox, clearOutbox, outboxItems, removeFromOutbox, snapForm, snapItem } from './outbox';

const CACHE_KEYS = { user: 'snapflash_user', friends: 'snapflash_friends', stories: 'snapflash_stories' };
const readCache = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeCache = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export default function App() {
  const [user, setUser] = useState(() => (getToken() ? readCache(CACHE_KEYS.user, null) : null));
  const [booting, setBooting] = useState(() => !!getToken() && !readCache(CACHE_KEYS.user, null));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [outboxVersion, setOutboxVersion] = useState(0);
  const flushing = useRef(false);
  const [tab, setTab] = useState('camera');
  const [friendsData, setFriendsData] = useState(() =>
    readCache(CACHE_KEYS.friends, { friends: [], conversations: [], incoming: [], outgoing: [] })
  );
  const [storyGroups, setStoryGroups] = useState(() => readCache(CACHE_KEYS.stories, []));
  const [capture, setCapture] = useState(null);
  const [draft, setDraft] = useState(null);
  const [preselect, setPreselect] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [chatWith, setChatWith] = useState(null);
  const [storyView, setStoryView] = useState(null);
  const [showFriends, setShowFriends] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const [socket, setSocket] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const refreshFriends = useCallback(
    () =>
      api('/friends')
        .then((d) => {
          setFriendsData(d);
          writeCache(CACHE_KEYS.friends, d);
        })
        .catch(() => {}),
    []
  );
  const refreshStories = useCallback(
    () =>
      api('/stories')
        .then((d) => {
          setStoryGroups(d.groups);
          writeCache(CACHE_KEYS.stories, d.groups);
        })
        .catch(() => {}),
    []
  );
  const refreshPending = useCallback(() => outboxItems().then((items) => setPendingCount(items.length)).catch(() => {}), []);

  const flushOutbox = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    flushing.current = true;
    let sent = 0;
    try {
      for (const item of await outboxItems()) {
        try {
          if (item.type === 'snap') await api('/snaps', { method: 'POST', form: snapForm(item) });
          else await api(`/messages/${item.to}`, { method: 'POST', body: { body: item.body } });
          sent++;
        } catch (err) {
          if (err.offline || err.status >= 500) break;
          notify(`Un envoi en attente n'a pas pu partir : ${err.message}`);
        }
        await removeFromOutbox(item.id);
      }
    } catch {
    } finally {
      flushing.current = false;
    }
    refreshPending();
    if (sent) {
      notify(sent > 1 ? `${sent} envois en attente sont partis` : "L'envoi en attente est parti");
      setOutboxVersion((v) => v + 1);
      refreshFriends();
      refreshStories();
    }
  }, [notify, refreshFriends, refreshStories, refreshPending]);

  const logout = useCallback(async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    clearOutbox().catch(() => {});
    setToken(null);
    setUser(null);
    setShowFriends(false);
    setShowSettings(false);
    setTab('camera');
  }, []);

  const resetSession = useCallback(() => {
    clearOutbox().catch(() => {});
    setToken(null);
    setUser(null);
    setShowFriends(false);
    setShowSettings(false);
    setChatWith(null);
    setTab('camera');
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api('/me')
      .then((d) => setUser(d.user))
      .catch((err) => err.status === 401 && resetSession())
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (user) writeCache(CACHE_KEYS.user, user);
    else Object.values(CACHE_KEYS).forEach((k) => localStorage.removeItem(k));
  }, [user]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshPending();
    if (online) flushOutbox();
  }, [user?.id, online, flushOutbox, refreshPending]);

  useEffect(() => {
    if (!user) return;
    refreshFriends();
    refreshStories();
    const s = io({ auth: { token: getToken() } });
    s.on('connect', () => {
      flushOutbox();
      refreshFriends();
      refreshStories();
    });
    s.on('snap:new', ({ from, mediaType }) => {
      notify(`${from.displayName} vous a envoyé un ${mediaType === 'video' ? 'snap vidéo' : 'snap'}`);
      refreshFriends();
    });
    s.on('snap:opened', refreshFriends);
    s.on('message:new', ({ from }) => {
      refreshFriends();
      setChatWith((current) => {
        if (current?.id !== from.id) notify(`Nouveau message de ${from.displayName}`);
        return current;
      });
    });
    s.on('message:read', refreshFriends);
    s.on('messages:deleted', refreshFriends);
    s.on('friends:changed', ({ request } = {}) => {
      if (request) notify(`${request.displayName} veut vous ajouter en ami`);
      refreshFriends();
      refreshStories();
    });
    s.on('story:new', ({ from }) => {
      notify(`${from.displayName} a publié une story`);
      refreshStories();
    });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [user?.id, refreshFriends, refreshStories, flushOutbox, notify]);

  if (booting) return <div className="app splash"><img src="/icon.svg" alt="" width="96" /></div>;
  if (!user) return <Auth onAuth={(token, u) => { setToken(token); setUser(u); }} />;

  const sendDraft = async (recipients, story) => {
    const item = await snapItem(draft, recipients, story);
    let queued = !navigator.onLine;
    if (!queued) {
      try {
        await api('/snaps', { method: 'POST', form: snapForm(item) });
      } catch (err) {
        if (!err.offline) throw err;
        queued = true;
      }
    }
    if (queued) {
      await addToOutbox(item);
      refreshPending();
    }
    URL.revokeObjectURL(capture?.url);
    setDraft(null);
    setCapture(null);
    setPreselect(null);
    if (queued) return notify('Hors ligne : envoi au retour du réseau');
    notify(story && recipients.length ? 'Envoyé et ajouté à votre story !' : story ? 'Ajouté à votre story !' : 'Snap envoyé !');
    refreshFriends();
    if (story) refreshStories();
  };

  const openFriend = (friend) => {
    if (friend.unreadSnaps.length) setViewing({ friend, snapIds: friend.unreadSnaps.map((s) => s.id) });
    else setChatWith(friend);
  };

  const pendingRequests = friendsData.incoming.length;
  const blockUser = async (u) => {
    if (!confirm(`Bloquer ${u.displayName} ? Vous ne serez plus amis et il ne pourra plus vous contacter ni vous trouver.`)) return;
    await api('/blocks', { method: 'POST', body: { userId: u.id } }).catch(() => {});
    notify(`${u.displayName} est bloqué`);
    setChatWith(null);
    refreshFriends();
    refreshStories();
  };

  const unreadTotal = [...friendsData.friends, ...(friendsData.conversations || [])].reduce((n, f) => n + f.unreadSnaps.length + (f.unreadMessages ? 1 : 0), 0);
  const unseenStories = storyGroups.filter((g) => !g.mine && !g.discover && !g.allSeen).length;
  const overlayOpen = capture || draft || viewing || chatWith || storyView || showFriends || showSettings;

  return (
    <div className={`app ${online ? '' : 'offline'}`}>
      {tab === 'camera' && !capture && (
        <Camera
          user={user}
          pendingRequests={pendingRequests}
          onProfile={() => setShowFriends(true)}
          onCapture={setCapture}
          active={!overlayOpen}
        />
      )}
      {tab === 'chats' && (
        <ChatList
          user={user}
          data={friendsData}
          pendingRequests={pendingRequests}
          onOpen={openFriend}
          onChat={setChatWith}
          onProfile={() => setShowFriends(true)}
        />
      )}
      {tab === 'stories' && (
        <Stories
          user={user}
          groups={storyGroups}
          onOpen={(index) => setStoryView({ index })}
          onAdd={() => setTab('camera')}
          onProfile={() => setShowFriends(true)}
          onRefresh={refreshStories}
        />
      )}

      {!overlayOpen && (
        <nav className={`bottom-nav ${tab === 'camera' ? 'transparent' : ''}`}>
          <button className={tab === 'chats' ? 'active' : ''} onClick={() => setTab('chats')} aria-label="Discussions">
            <span className="nav-icon">💬</span>
            {unreadTotal > 0 && <span className="badge">{unreadTotal}</span>}
            <span>Chat</span>
          </button>
          <button className={tab === 'camera' ? 'active' : ''} onClick={() => setTab('camera')} aria-label="Caméra">
            <span className="nav-icon">📷</span>
            <span>Caméra</span>
          </button>
          <button className={tab === 'stories' ? 'active' : ''} onClick={() => setTab('stories')} aria-label="Stories">
            <span className="nav-icon">👥</span>
            {unseenStories > 0 && <span className="badge purple">{unseenStories}</span>}
            <span>Stories</span>
          </button>
        </nav>
      )}

      {capture && !draft && (
        <Editor
          capture={capture}
          onCancel={() => {
            URL.revokeObjectURL(capture.url);
            setCapture(null);
          }}
          onNext={setDraft}
        />
      )}
      {draft && (
        <SendTo
          user={user}
          friends={friendsData.friends}
          conversations={friendsData.conversations}
          preselect={preselect}
          onBack={() => setDraft(null)}
          onSend={sendDraft}
        />
      )}
      {viewing && (
        <SnapViewer
          friend={viewing.friend}
          snapIds={viewing.snapIds}
          onClose={() => {
            setViewing(null);
            refreshFriends();
          }}
        />
      )}
      {chatWith && (
        <Chat
          user={user}
          friend={chatWith}
          socket={socket}
          outboxVersion={outboxVersion}
          onQueued={refreshPending}
          onBack={() => {
            setChatWith(null);
            refreshFriends();
          }}
          onSnap={() => {
            setPreselect(chatWith.id);
            setChatWith(null);
            setTab('camera');
          }}
          onBlock={() => blockUser(chatWith)}
        />
      )}
      {storyView && (
        <StoryViewer
          groups={storyGroups}
          startIndex={storyView.index}
          onClose={() => {
            setStoryView(null);
            refreshStories();
          }}
          onDeleted={() => notify('Story supprimée')}
        />
      )}
      {showFriends && (
        <Friends
          user={user}
          data={friendsData}
          onClose={() => setShowFriends(false)}
          onChanged={refreshFriends}
          onLogout={logout}
          onSettings={() => setShowSettings(true)}
          notify={notify}
        />
      )}
      {showSettings && (
        <Settings
          user={user}
          onClose={() => setShowSettings(false)}
          onUserChange={setUser}
          onBlocksChanged={() => {
            refreshFriends();
            refreshStories();
          }}
          onDeleted={() => {
            resetSession();
            notify('Votre compte a été supprimé');
          }}
          notify={notify}
        />
      )}
      {!online && (
        <div className="offline-banner">
          Hors ligne{pendingCount > 0 ? ` · ${pendingCount} envoi${pendingCount > 1 ? 's' : ''} en attente` : ''}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
