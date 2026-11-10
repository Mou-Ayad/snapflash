import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { api } from '../api';

const RING_TIMEOUT = 30000;
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function Call({ call, socket, onEnd }) {
  const { peer, video, role } = call;
  const [state, setState] = useState(role === 'caller' ? 'calling' : 'incoming');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteVideo, setRemoteVideo] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const pendingIce = useRef([]);
  const ended = useRef(false);

  const cleanup = () => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const finish = (message, notifyPeer = true) => {
    if (ended.current) return;
    ended.current = true;
    if (notifyPeer) socket?.emit('call:end', { to: peer.id });
    cleanup();
    onEnd(message);
  };

  const getMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
    streamRef.current = stream;
    if (localRef.current) localRef.current.srcObject = stream;
    return stream;
  };

  const createPeer = async () => {
    const { iceServers } = await api('/ice').catch(() => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }));
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    streamRef.current.getTracks().forEach((t) => pc.addTrack(t, streamRef.current));
    pc.onicecandidate = (e) => e.candidate && socket.emit('call:signal', { to: peer.id, candidate: e.candidate });
    pc.ontrack = (e) => {
      const remote = e.streams[0];
      if (remoteRef.current && remoteRef.current.srcObject !== remote) remoteRef.current.srcObject = remote;
      if (e.track.kind === 'video') setRemoteVideo(true);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setState('active');
      if (pc.connectionState === 'failed') finish("L'appel n'a pas pu se connecter");
    };
    return pc;
  };

  const flushIce = async () => {
    for (const c of pendingIce.current.splice(0)) await pcRef.current.addIceCandidate(c).catch(() => {});
  };

  useEffect(() => {
    if (!socket) return;
    const onAccept = async ({ from }) => {
      if (from.id !== peer.id || role !== 'caller') return;
      setState('connecting');
      const pc = await createPeer();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call:signal', { to: peer.id, sdp: pc.localDescription });
    };
    const onSignal = async ({ from, sdp, candidate }) => {
      if (from.id !== peer.id) return;
      const pc = pcRef.current;
      if (sdp) {
        if (!pc) return;
        await pc.setRemoteDescription(sdp);
        if (sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('call:signal', { to: peer.id, sdp: pc.localDescription });
        }
        flushIce();
      } else if (candidate) {
        if (pc?.remoteDescription) pc.addIceCandidate(candidate).catch(() => {});
        else pendingIce.current.push(candidate);
      }
    };
    const onReject = ({ from, reason }) =>
      from.id === peer.id && finish(reason === 'busy' ? `${peer.displayName} est déjà en appel` : `${peer.displayName} a refusé l'appel`, false);
    const onEndEvt = ({ from }) => from.id === peer.id && finish(state === 'incoming' ? 'Appel manqué' : 'Appel terminé', false);
    const onUnavailable = ({ from }) => from === peer.id && finish(`${peer.displayName} n'est pas connecté`, false);
    const onHandled = ({ peer: p }) => p === peer.id && role === 'callee' && state === 'incoming' && finish(null, false);
    socket.on('call:accept', onAccept);
    socket.on('call:signal', onSignal);
    socket.on('call:reject', onReject);
    socket.on('call:end', onEndEvt);
    socket.on('call:unavailable', onUnavailable);
    socket.on('call:handled', onHandled);
    return () => {
      socket.off('call:accept', onAccept);
      socket.off('call:signal', onSignal);
      socket.off('call:reject', onReject);
      socket.off('call:end', onEndEvt);
      socket.off('call:unavailable', onUnavailable);
      socket.off('call:handled', onHandled);
    };
  }, [socket, state]);

  useEffect(() => {
    if (role !== 'caller') return;
    getMedia()
      .then(() => socket.emit('call:invite', { to: peer.id, video }))
      .catch(() => finish("Impossible d'accéder au micro ou à la caméra"));
  }, []);

  useEffect(() => {
    if (state !== 'calling' && state !== 'incoming') return;
    const t = setTimeout(() => finish(state === 'calling' ? 'Pas de réponse' : 'Appel manqué'), RING_TIMEOUT);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (state !== 'active') return;
    const i = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [state]);

  useEffect(() => () => cleanup(), []);

  const accept = async () => {
    setState('connecting');
    try {
      await getMedia();
      await createPeer();
      socket.emit('call:accept', { to: peer.id });
    } catch {
      socket.emit('call:reject', { to: peer.id });
      finish("Impossible d'accéder au micro ou à la caméra", false);
    }
  };

  const decline = () => {
    socket.emit('call:reject', { to: peer.id });
    finish(null, false);
  };

  const toggleMute = () => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  };

  const toggleCamera = () => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = cameraOff));
    setCameraOff(!cameraOff);
  };

  const status = {
    calling: video ? 'Appel vidéo…' : 'Appel…',
    incoming: video ? 'Appel vidéo entrant' : 'Appel vocal entrant',
    connecting: 'Connexion…',
    active: fmt(seconds),
  }[state];

  return (
    <div className={`screen call-screen overlay-screen ${video ? 'video' : 'audio'}`} data-state={state}>
      <video ref={remoteRef} className={`call-remote ${video && remoteVideo ? '' : 'hidden'}`} autoPlay playsInline />
      {(!video || !remoteVideo) && (
        <div className="call-center">
          <Avatar user={peer} size={110} />
          <h2>{peer.displayName}</h2>
          <span className="call-status">{status}</span>
        </div>
      )}
      {video && remoteVideo && (
        <div className="call-top">
          <strong>{peer.displayName}</strong>
          <span>{status}</span>
        </div>
      )}
      {video && <video ref={localRef} className={`call-local ${cameraOff || state === 'incoming' ? 'hidden' : ''}`} autoPlay playsInline muted />}
      <div className="call-controls">
        {state === 'incoming' ? (
          <>
            <button className="call-btn decline" onClick={decline} aria-label="Refuser">✕</button>
            <button className="call-btn accept" onClick={accept} aria-label="Accepter">{video ? '🎥' : '📞'}</button>
          </>
        ) : (
          <>
            <button className={`call-btn ${muted ? 'on' : ''}`} onClick={toggleMute} aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'}>
              {muted ? '🔇' : '🎙️'}
            </button>
            {video && (
              <button className={`call-btn ${cameraOff ? 'on' : ''}`} onClick={toggleCamera} aria-label={cameraOff ? 'Activer la caméra' : 'Couper la caméra'}>
                {cameraOff ? '🚫' : '📹'}
              </button>
            )}
            <button className="call-btn decline" onClick={() => finish('Appel terminé')} aria-label="Raccrocher">✕</button>
          </>
        )}
      </div>
    </div>
  );
}
