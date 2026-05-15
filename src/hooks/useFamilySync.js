import { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';

export const useFamilySync = (roomId, userId, localStream) => {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [peerStatus, setPeerStatus] = useState('idle');
  const [peerNames, setPeerNames] = useState({});

  const peerRef = useRef(null);
  const dataConns = useRef({});
  const mediaCalls = useRef({});

  // Segédfunkció a videó hozzáadásához
  const addStream = (pid, stream) => {
    setRemoteStreams(prev => prev.find(s => s.id === pid) ? prev : [...prev, { id: pid, stream }]);
  };

  // Segédfunkció a kapcsolatok kezeléséhez
  const connectTo = (p, targetId) => {
    if (dataConns.current[targetId] || targetId === p.id) return;

    // Adatkapcsolat (Chat-hez)
    const conn = p.connect(targetId);
    conn.on('open', () => {
      dataConns.current[targetId] = conn;
      conn.send({ type: 'identity', name: userId });
    });
    conn.on('data', (data) => {
      if (data.type === 'identity') setPeerNames(prev => ({ ...prev, [targetId]: data.name }));
      if (data.type === 'chat') setMessages(prev => [...prev, { ...data, _id: Math.random() }]);
      if (data.type === 'reaction') setReactions(prev => [...prev, { ...data, _id: Math.random() }]);
    });
    conn.on('close', () => {
      setRemoteStreams(prev => prev.filter(s => s.id !== targetId));
      delete dataConns.current[targetId];
    });

    // Videó hívás
    const call = p.call(targetId, localStream);
    call.on('stream', (stream) => {
      addStream(targetId, stream);
      mediaCalls.current[targetId] = call;
    });
  };

  useEffect(() => {
    if (!roomId || !userId || !localStream) return;
    setPeerStatus('connecting');

    // Tisztított szobanév + Időbélyeg (10 percenként változik, hogy ne ragadjon be)
    const timeBlock = Math.floor(Date.now() / 600000);
    const baseId = roomId.replace(/[^a-z0-9]/gi, '').toLowerCase();

    const trySlot = (slot) => {
      if (slot > 10) { // 10 helyet nézünk meg, valahol biztos lesz hely
        setPeerStatus('full');
        return;
      }

      const myId = `${baseId}_${timeBlock}_${slot}`;
      const p = new Peer(myId, {
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
      });

      p.on('open', () => {
        peerRef.current = p;
        setPeerStatus('online');

        // Bejövő hívások fogadása
        p.on('call', (call) => {
          call.answer(localStream);
          call.on('stream', (stream) => addStream(call.peer, stream));
        });

        // Bejövő adatkapcsolatok fogadása
        p.on('connection', (conn) => {
          conn.on('data', (data) => {
            if (data.type === 'identity') setPeerNames(prev => ({ ...prev, [conn.peer]: data.name }));
            if (data.type === 'chat') setMessages(prev => [...prev, { ...data, _id: Math.random() }]);
            if (data.type === 'reaction') setReactions(prev => [...prev, { ...data, _id: Math.random() }]);
          });
        });

        // Próbálunk csatlakozni az összes többi lehetséges slothoz
        for (let i = 1; i <= 10; i++) {
          const targetId = `${baseId}_${timeBlock}_${i}`;
          if (targetId !== myId) connectTo(p, targetId);
        }
      });

      p.on('error', (err) => {
        p.destroy();
        if (err.type === 'unavailable-id') {
          trySlot(slot + 1); // Ha foglalt, jön a következő slot
        } else {
          // Egyéb hiba esetén is próbálunk egy másikat
          setTimeout(() => trySlot(slot + 1), 500);
        }
      });
    };

    trySlot(1);

    return () => {
      if (peerRef.current) peerRef.current.destroy();
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
