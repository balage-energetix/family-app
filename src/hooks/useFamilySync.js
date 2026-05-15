import { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';

const STUN_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  },
  debug: 1,
};

export const useFamilySync = (roomId, userId, localStream) => {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [peerStatus, setPeerStatus] = useState('idle');
  const [peerNames, setPeerNames] = useState({});

  const peerRef = useRef(null);
  const dataConns = useRef({});
  const mediaCalls = useRef({});
  const isDestroyed = useRef(false);

  const addStream = (pid, stream) => {
    setRemoteStreams(prev => prev.find(s => s.id === pid) ? prev : [...prev, { id: pid, stream }]);
  };

  const removePeer = (pid) => {
    setRemoteStreams(prev => prev.filter(s => s.id !== pid));
    setPeerNames(prev => {
      const updated = { ...prev };
      delete updated[pid];
      return updated;
    });
    delete dataConns.current[pid];
    delete mediaCalls.current[pid];
  };

  const setupConnection = (conn) => {
    dataConns.current[conn.peer] = conn;
    conn.on('open', () => conn.send({ type: 'identity', name: userId }));
    conn.on('data', (data) => {
      if (data.type === 'identity') setPeerNames(prev => ({ ...prev, [conn.peer]: data.name }));
      if (data.type === 'chat') setMessages(prev => [...prev, { ...data, _id: Math.random() }]);
      if (data.type === 'reaction') setReactions(prev => [...prev, { ...data, _id: Math.random() }]);
    });
    conn.on('close', () => removePeer(conn.peer));
  };

  useEffect(() => {
    if (!roomId || !userId || !localStream) return;
    isDestroyed.current = false;
    setPeerStatus('connecting');

    const cleanRoom = roomId.replace(/[^a-z0-9]/gi, '').toLowerCase();

    const tryJoin = (slot) => {
      if (slot > 4) {
        setPeerStatus('full');
        return;
      }

      const slotId = `${cleanRoom}_${slot}`;
      const p = new Peer(slotId, STUN_CONFIG);
      
      // Gyors timeout, ha a szerver nem válaszol
      const timeout = setTimeout(() => {
        if (!p.open) {
          p.destroy();
          tryJoin(slot + 1);
        }
      }, 3000);

      p.on('open', () => {
        clearTimeout(timeout);
        if (isDestroyed.current) { p.destroy(); return; }
        peerRef.current = p;
        setPeerStatus('online');

        p.on('call', (call) => {
          call.answer(localStream);
          call.on('stream', (stream) => {
            addStream(call.peer, stream);
            mediaCalls.current[call.peer] = call;
          });
        });

        p.on('connection', setupConnection);

        // Csatlakozás a többi slot-hoz (1-4)
        for (let i = 1; i <= 4; i++) {
          const targetId = `${cleanRoom}_${i}`;
          if (targetId === slotId) continue;

          // Adatcsatorna
          const conn = p.connect(targetId);
          setupConnection(conn);

          // Videó hívás
          const call = p.call(targetId, localStream);
          call.on('stream', (stream) => {
            addStream(targetId, stream);
            mediaCalls.current[targetId] = call;
          });
        }
      });

      p.on('error', (err) => {
        clearTimeout(timeout);
        p.destroy();
        if (isDestroyed.current) return;
        
        // Ha az ID foglalt, próbáljuk a következőt
        if (err.type === 'unavailable-id') {
          tryJoin(slot + 1);
        } else {
          // Egyéb hiba esetén is próbáljuk a következőt, hátha a szerver bolondozik
          setTimeout(() => tryJoin(slot + 1), 500);
        }
      });
    };

    tryJoin(1);

    return () => {
      isDestroyed.current = true;
      if (peerRef.current) peerRef.current.destroy();
      setRemoteStreams([]);
      setPeerStatus('idle');
    };
  }, [roomId, userId, localStream]);

  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text };
    Object.values(dataConns.current).forEach(c => c.open && c.send(msg));
    setMessages(prev => [...prev, { ...msg, _id: Math.random() }]);
  };

  const sendReaction = (emoji) => {
    const r = { type: 'reaction', emoji, sender: userId };
    Object.values(dataConns.current).forEach(c => c.open && c.send(r));
    setReactions(prev => [...prev, { ...r, _id: Math.random() }]);
  };

  return { remoteStreams, messages, reactions, peerStatus, peerNames, sendMessage, sendReaction };
};
