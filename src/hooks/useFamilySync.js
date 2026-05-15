import { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';

const clean = (s) => s.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 15);
const ICE = { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };

export const useFamilySync = (roomId, userId, localStream) => {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages,     setMessages]      = useState([]);
  const [reactions,    setReactions]     = useState([]);
  const [peerStatus,   setPeerStatus]    = useState('idle');
  const [mySlot,       setMySlot]        = useState(null);
  const [peerNames,    setPeerNames]     = useState({});

  const R = useRef({ peer: null, slot: 0, dataConns: {}, mediaCons: {}, destroyed: false });

  const addStream = (pid, s) => setRemoteStreams(p => p.find(x => x.id === pid) ? p : [...p, { id: pid, stream: s }]);
  const dropStream = (pid) => { setRemoteStreams(p => p.filter(x => x.id !== pid)); setPeerNames(p => { const n={...p}; delete n[pid]; return n; }); };

  const setupData = (conn) => {
    const r = R.current;
    if (r.dataConns[conn.peer]?.open) return;
    r.dataConns[conn.peer] = conn;
    conn.on('open',  () => conn.send({ type: 'hello', name: userId }));
    conn.on('close', () => { if (!r.destroyed) { delete r.dataConns[conn.peer]; dropStream(conn.peer); } });
    conn.on('data',  (msg) => {
      if (r.destroyed) return;
      if (msg.type === 'hello')    setPeerNames(p => ({ ...p, [conn.peer]: msg.name }));
      if (msg.type === 'chat')     setMessages(p => [...p, { ...msg, id: Math.random() + '', ts: Date.now() }]);
      if (msg.type === 'reaction') setReactions(p => [...p, { ...msg, id: Math.random() + '' }]);
    });
  };

  const callSlot = (peer, targetSlot, stream) => {
    const r = R.current;
    const targetId = `fc${clean(roomId)}s${targetSlot}`;
    if (r.mediaCons[targetId]) return;

    const dc = peer.connect(targetId, { reliable: true });
    setupData(dc);

    const call = peer.call(targetId, stream);
    r.mediaCons[targetId] = call;
    call.on('stream', s => addStream(targetId, s));
    call.on('close',  () => { if (!r.destroyed) { delete r.mediaCons[targetId]; dropStream(targetId); } });
  };

  useEffect(() => {
    if (!roomId || !userId || !localStream) return;
    const r = R.current;
    r.destroyed = false;
    setPeerStatus('connecting');

    // Try slots 1-4; take first available. Higher slot calls all lower slots.
    const trySlot = (n) => {
      if (n > 4) { setPeerStatus('full'); return; }

      const slotId = `fc${clean(roomId)}s${n}`;
      const peer = new Peer(slotId, ICE);

      const timer = setTimeout(() => { peer.destroy(); trySlot(n + 1); }, 6000);

      peer.on('open', () => {
        clearTimeout(timer);
        if (r.destroyed) { peer.destroy(); return; }
        r.peer = peer;
        r.slot = n;
        setMySlot(n);
        setPeerStatus('online');

        // Answer incoming calls
        peer.on('call', (call) => {
          const cid = call.peer;
          if (r.mediaCons[cid]) return;
          r.mediaCons[cid] = call;
          call.answer(localStream);
          call.on('stream', s => addStream(cid, s));
          call.on('close',  () => { if (!r.destroyed) { delete r.mediaCons[cid]; dropStream(cid); } });
        });

        peer.on('connection', (conn) => setupData(conn));
        peer.on('disconnected', () => { if (!r.destroyed) peer.reconnect(); });

        // Call all lower slots once
        for (let i = 1; i < n; i++) callSlot(peer, i, localStream);
      });

      peer.on('error', (err) => {
        clearTimeout(timer);
        peer.destroy();
        if (r.destroyed) return;
        if (err.type === 'unavailable-id') {
          trySlot(n + 1);
        } else {
          setPeerStatus('error');
        }
      });
    };

    trySlot(1);

    return () => {
      r.destroyed = true;
      r.peer?.destroy();
      R.current = { peer: null, slot: 0, dataConns: {}, mediaCons: {}, destroyed: true };
      setRemoteStreams([]); setPeerStatus('idle'); setMySlot(null);
    };
  }, [roomId, userId, localStream]); // eslint-disable-line

  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text };
    Object.values(R.current.dataConns).forEach(c => { if (c.open) c.send(msg); });
    setMessages(p => [...p, { ...msg, id: Math.random() + '', ts: Date.now() }]);
  };

  const sendReaction = (emoji) => {
    const r = { type: 'reaction', emoji, sender: userId };
    Object.values(R.current.dataConns).forEach(c => { if (c.open) c.send(r); });
    setReactions(p => [...p, { ...r, id: Math.random() + '' }]);
  };

  return { remoteStreams, messages, reactions, peerStatus, mySlot, peerNames, sendMessage, sendReaction };
};
