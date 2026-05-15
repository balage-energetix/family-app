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

  const addStream = (pid, stream) => {
    setRemoteStreams(prev => prev.find(s => s.id === pid) ? prev : [...prev, { id: pid, stream }]);
  };

  const setupConn = (conn) => {
    if (dataConns.current[conn.peer]) return;
    dataConns.current[conn.peer] = conn;
    
    conn.on('open', () => conn.send({ type: 'hi', name: userId }));
    conn.on('data', (data) => {
      if (data.type === 'hi') {
        setPeerNames(prev => ({ ...prev, [conn.peer]: data.name }));
        // Ha mi vagyunk a hostok, küldjük el az összes ismert peer listáját az újnak
        if (peerRef.current?.id.includes('_host')) {
          const peers = Object.keys(dataConns.current).filter(id => id !== conn.peer);
          conn.send({ type: 'list', peers });
        }
      }
      if (data.type === 'list') {
        data.peers.forEach(pid => connectTo(pid));
      }
      if (data.type === 'chat') setMessages(prev => [...prev, { ...data, _id: Math.random() }]);
      if (data.type === 'reaction') setReactions(prev => [...prev, { ...data, _id: Math.random() }]);
    });
    conn.on('close', () => {
      setRemoteStreams(prev => prev.filter(s => s.id !== conn.peer));
      delete dataConns.current[conn.peer];
    });
  };

  const connectTo = (targetId) => {
    if (!peerRef.current || dataConns.current[targetId] || targetId === peerRef.current.id) return;

    const conn = peerRef.current.connect(targetId);
    setupConn(conn);

    const call = peerRef.current.call(targetId, localStream);
    call.on('stream', (stream) => {
      addStream(targetId, stream);
      mediaCalls.current[targetId] = call;
    });
  };

  useEffect(() => {
    if (!roomId || !userId || !localStream) return;
    setPeerStatus('connecting');

    const cleanRoom = roomId.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const hostId = `${cleanRoom}_host`;
    const myRandomId = `${cleanRoom}_user_${Math.random().toString(36).slice(2, 7)}`;

    // 1. Megpróbálunk HOST lenni
    const pHost = new Peer(hostId, STUN_CONFIG);
    
    pHost.on('open', () => {
      peerRef.current = pHost;
      setPeerStatus('online');
      pHost.on('connection', setupConn);
      pHost.on('call', (call) => {
        call.answer(localStream);
        call.on('stream', (s) => addStream(call.peer, s));
      });
    });

    pHost.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // 2. Ha már van HOST, belépünk GUEST-ként egy véletlen ID-val
        pHost.destroy();
        const pGuest = new Peer(myRandomId, STUN_CONFIG);
        
        pGuest.on('open', () => {
          peerRef.current = pGuest;
          setPeerStatus('online');
          
          // Csatlakozunk a HOST-hoz
          connectTo(hostId);

          pGuest.on('connection', setupConn);
          pGuest.on('call', (call) => {
            call.answer(localStream);
            call.on('stream', (s) => addStream(call.peer, s));
          });
        });

        pGuest.on('error', () => setPeerStatus('error'));
      } else {
        setPeerStatus('error');
      }
    });

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
