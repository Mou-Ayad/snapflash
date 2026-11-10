import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { api } from '../api';

export default function Chat({ user, friend, socket, onBack, onSnap }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef(null);
  const typingTimer = useRef(null);
  const pressTimer = useRef(null);
  const sentTyping = useRef(false);

  useEffect(() => {
    api(`/messages/${friend.id}`)
      .then((d) => setMessages(d.messages))
      .finally(() => setLoaded(true));
    return () => {
      api(`/messages/${friend.id}/leave`, { method: 'POST' }).catch(() => {});
    };
  }, [friend.id]);

  useEffect(() => {
    if (!socket) return;
    const onNew = ({ message }) => {
      if (message.senderId !== friend.id) return;
      setMessages((prev) => [...prev, message]);
      setTyping(false);
      api(`/messages/item/${message.id}/read`, { method: 'POST' }).catch(() => {});
    };
    const onRead = ({ ids, readAt }) => setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, readAt } : m)));
    const onDeleted = ({ ids }) => setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
    const onSaved = ({ id, saved }) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, saved } : m)));
    const onTyping = ({ from, typing }) => from === friend.id && setTyping(typing);
    socket.on('message:new', onNew);
    socket.on('message:read', onRead);
    socket.on('messages:deleted', onDeleted);
    socket.on('message:saved', onSaved);
    socket.on('typing', onTyping);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:read', onRead);
      socket.off('messages:deleted', onDeleted);
      socket.off('message:saved', onSaved);
      socket.off('typing', onTyping);
    };
  }, [socket, friend.id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, typing]);

  const emitTyping = (value) => {
    if (sentTyping.current === value) return;
    sentTyping.current = value;
    socket?.emit('typing', { to: friend.id, typing: value });
  };

  const onChange = (e) => {
    setText(e.target.value);
    emitTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 1500);
  };

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    emitTyping(false);
    const d = await api(`/messages/${friend.id}`, { method: 'POST', body: { body } }).catch(() => null);
    if (d) setMessages((prev) => [...prev, d.message]);
  };

  const toggleSave = async (m) => {
    const d = await api(`/messages/item/${m.id}/save`, { method: 'POST' }).catch(() => null);
    if (d) setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, saved: d.saved } : x)));
  };

  const pressStart = (m) => {
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      toggleSave(m);
    }, 500);
  };
  const pressEnd = () => clearTimeout(pressTimer.current);

  const lastMine = [...messages].reverse().find((m) => m.senderId === user.id);

  return (
    <div className="screen panel chat overlay-screen">
      <header className="panel-header">
        <button className="icon-btn dark" onClick={onBack} aria-label="Retour">‹</button>
        <div className="chat-title">
          <Avatar user={friend} size={32} />
          <div>
            <strong>{friend.displayName}</strong>
            <span className="muted small">{typing ? 'écrit…' : `@${friend.username}`}</span>
          </div>
        </div>
        <button className="icon-btn dark" onClick={onSnap} aria-label="Envoyer un snap">📷</button>
      </header>
      <div className="messages" ref={listRef}>
        <p className="ephemeral-note">
          Les messages s'effacent une fois lus, quand vous quittez la conversation. Maintenez un message (ou double-cliquez) pour l'enregistrer.
        </p>
        {loaded && !messages.length && <p className="empty">Aucun message. Dites bonjour 👋</p>}
        {messages.map((m, i) => {
          const mine = m.senderId === user.id;
          const showName = i === 0 || messages[i - 1].senderId !== m.senderId;
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : 'theirs'} ${m.saved ? 'saved' : ''}`}>
              {showName && <span className="msg-author">{mine ? 'MOI' : friend.displayName.toUpperCase()}</span>}
              <div
                className="msg-body"
                onPointerDown={() => pressStart(m)}
                onPointerUp={pressEnd}
                onPointerLeave={pressEnd}
                onDoubleClick={() => toggleSave(m)}
                onContextMenu={(e) => e.preventDefault()}
              >
                {m.body}
              </div>
              {m.saved && <span className="msg-meta">Enregistré</span>}
              {mine && m.id === lastMine?.id && <span className="msg-meta">{m.readAt ? 'Lu' : 'Envoyé'}</span>}
            </div>
          );
        })}
        {typing && (
          <div className="msg theirs">
            <div className="msg-body typing-dots"><span /><span /><span /></div>
          </div>
        )}
      </div>
      <form className="composer" onSubmit={send}>
        <button type="button" className="icon-btn dark" onClick={onSnap} aria-label="Snap">📷</button>
        <input value={text} onChange={onChange} placeholder="Envoyer un chat" maxLength={2000} />
        <button className="send-arrow small" disabled={!text.trim()} aria-label="Envoyer">➤</button>
      </form>
    </div>
  );
}
