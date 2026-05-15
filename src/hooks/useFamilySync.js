import { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';

export const useFamilySync = (roomId, userId, localStream) => {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages,     setMessages]      = useState([]);
  const [reactions,    setReactions]     = useState([]);
  const [peerStatus,   setPeerStatus]    = useState('idle');
  const [peerNames,    setPeerNames]     = useState({});

  const destroyed = useRef(false);
  const peer      = useRef(null);
  const dataConns = useRef({});
  const mediaCons = useRef({});

  const addStream = (pid, s) =>
    setRemoteStreams(p => p.find(x => x.id === pid) ? p : [...p, { id: pid, stream: s }]);

  const dropStream = (pid) => {
    setRemoteStreams(p => p.filter(x => x.id !== pid));
    setPeerNames(p => { const n = { ...p }; delete n[pid]; return n; });
  };

  const setupData = (conn) => {
    if (dataConns.current[conn.peer]?.open) return;
    dataConns.current[conn.peer] = conn;
    conn.on('open',  () => conn.send({ type: 'hello', name: userId }));
    conn.on('close', () => { delete dataConns.current[conn.peer]; dropStream(conn.peer); });
    conn.on('data',  (m) => {
      if (destroyed.current) return;
      if (m.type === 'hello')    setPeerNames(p => ({ ...p, [conn.peer]: m.name }));
      if (m.type === 'chat')     setMessages(p => [...p, { ...m, _id: Math.random() }]);
      if (m.type === 'reaction') setReactions(p => [...p, { ...m, _id: Math.random() }]);
    });
  };

  const callPeer = (p, targetId) => {
    if (mediaCons.current[targetId] || !localStream) return;
    if (!dataConns.current[targetId]?.open) setupData(p.connect(targetId, { reliable: true }));
    const call = p.call(targetId, localStream);
    mediaCons.current[targetId] = call;
    call.on('stream', s => addStream(targetId, s));
    call.on('close',  () => { delete mediaCons.current[targetId]; dropStream(targetId); });
  };

  useEffect(() => {
    if (!roomId || !userId || !localStream) return;
    destroyed.current = false;
    setPeerStatus('connecting');

    // Simple room prefix (alphanumeric only)
    const prefix = roomId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12);
    // Time window (changes every 10 minutes) — prevents stale IDs from blocking
    const tw = Math.floor(Date.now() / 600000);

    const trySlot = (slot) => {
      if (slot > 20) { setPeerStatus('full'); return; }

      const slotId = `fc${prefix}${tw}s${slot}`;
      const p = new Peer(slotId, {
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
      });

      const t = setTimeout(() => { p.destroy(); trySlot(slot + 1); }, 7000);

      p.on('open', () => {
        clearTimeout(t);
        if (destroyed.current) { p.destroy(); return; }
        peer.current = p;
        setPeerStatus('online');

        // Answer incoming video calls
        p.on('call', (call) => {
          if (mediaCons.current[call.peer]) return;
          mediaCons.current[call.peer] = call;
          call.answer(localStream);
          call.on('stream', s => addStream(call.peer, s));
          call.on('close',  () => { delete mediaCons.current[call.peer]; dropStream(call.peer); });
        });

        // Accept incoming data connections
        p.on('connection', conn => setupData(conn));

        // Reconnect on drop
        p.on('disconnected', () => { if (!destroyed.current) p.reconnect(); });

        // Call all lower-numbered slots (they'll answer)
        for (let i = 1; i < slot; i++) {
          callPeer(p, `fc${prefix}${tw}s${i}`);
        }
      });

      p.on('error', () => {
        clearTimeout(t);
        p.destroy();
        if (!destroyed.current) trySlot(slot + 1); // try next slot on ANY error
      });
    };

    trySlot(1);

    return () => {
      destroyed.current = true;
      peer.current?.destroy();
      peer.current = null;
      dataConns.current = {};
      mediaCons.current = {};
      setRemoteStreams([]);
      setPeerStatus('idle');
    };
  }, [roomId, userId, localStream]); // eslint-disable-line

  const sendMessage = (text) => {
    const m = { type: 'chat', sender: userId, text };
    Object.values(dataConns.current).forEach(c => { if (c.open) c.send(m); });
    setMessages(p => [...p, { ...m, _id: Math.random() }]);
  };

  const sendReaction = (emoji) => {
    const r = { type: 'reaction', emoji, sender: userId };
    Object.values(dataConns.current).forEach(c => { if (c.open) c.send(r); });
    setReactions(p => [...p, { ...r, _id: Math.random() }]);
  };

  return { remoteStreams, messages, reactions, peerStatus, peerNames, sendMessage, sendReaction };
};
