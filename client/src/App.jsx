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

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!getToken());
  const [tab, setTab] = useState('camera');
  const [friendsData, setFriendsData] = useState({ friends: [], incoming: [], outgoing: [] });
  const [storyGroups, setStoryGroups] = useState([]);
  const [capture, setCapture] = useState(null);
  const [draft, setDraft] = useState(null);
  const [preselect, setPreselect] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [chatWith, setChatWith] = useState(null);
  const [storyView, setStoryView] = useState(null);
  const [showFriends, setShowFriends] = useState(false);
  const [toast, setToast] = useState(null);
  const [socket, setSocket] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const refreshFriends = useCallback(() => api('/friends').then(setFriendsData).catch(() => {}), []);
  const refreshStories = useCallback(() => api('/stories').then((d) => setStoryGroups(d.groups)).catch(() => {}), []);

  const logout = useCallback(async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setUser(null);
    setShowFriends(false);
    setTab('camera');
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api('/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshFriends();
    refreshStories();
    const s = io({ auth: { token: getToken() } });
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
  }, [user, refreshFriends, refreshStories, notify]);

  if (booting) return <div className="app splash"><img src="/icon.svg" alt="" width="96" /></div>;
  if (!user) return <Auth onAuth={(token, u) => { setToken(token); setUser(u); }} />;

  const sendDraft = async (recipients, story) => {
    const form = new FormData();
    const ext = draft.media.type.split('/')[1]?.split(';')[0] || 'bin';
    form.append('media', draft.media, `media.${ext}`);
    if (draft.overlay) form.append('overlay', draft.overlay, 'overlay.png');
    form.append('duration', String(draft.duration));
    form.append('meta', JSON.stringify(draft.meta));
    form.append('recipients', JSON.stringify(recipients));
    form.append('story', String(story));
    await api('/snaps', { method: 'POST', form });
    URL.revokeObjectURL(capture?.url);
    setDraft(null);
    setCapture(null);
    setPreselect(null);
    notify(story && recipients.length ? 'Envoyé et ajouté à votre story !' : story ? 'Ajouté à votre story !' : 'Snap envoyé !');
    refreshFriends();
    if (story) refreshStories();
  };

  const openFriend = (friend) => {
    if (friend.unreadSnaps.length) setViewing({ friend, snapIds: friend.unreadSnaps.map((s) => s.id) });
    else setChatWith(friend);
  };

  const pendingRequests = friendsData.incoming.length;
  const unreadTotal = friendsData.friends.reduce((n, f) => n + f.unreadSnaps.length + (f.unreadMessages ? 1 : 0), 0);
  const unseenStories = storyGroups.filter((g) => !g.mine && !g.allSeen).length;
  const overlayOpen = capture || draft || viewing || chatWith || storyView || showFriends;

  return (
    <div className="app">
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
          friends={friendsData.friends}
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
          onBack={() => {
            setChatWith(null);
            refreshFriends();
          }}
          onSnap={() => {
            setPreselect(chatWith.id);
            setChatWith(null);
            setTab('camera');
          }}
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
          notify={notify}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
