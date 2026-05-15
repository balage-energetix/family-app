import { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';

const rand = () => Math.random().toString(36).slice(2, 7);
const clean = (s) => s.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20);

// Google STUN servers for NAT traversal
const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
    ],
  },
  debug: 0,
};

export const useFamilySync = (roomId, userId, localStream) => {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages,     setMessages]      = useState([]);
  const [reactions,    setReactions]     = useState([]);
  const [peerStatus,   setPeerStatus]    = useState('idle');
  const [peerStep,     setPeerStep]      = useState('');  // visible debug step
  const [peerNames,    setPeerNames]     = useState({});

  const R = useRef(null);

  const initRef = () => {
    R.current = {
      myPeer: null, coordPeer: null,
      myId: null, isCoord: false,
      dataConns: {}, mediaCons: {},
      members: new Set(), memberConns: {},
      destroyed: false,
    };
  };

  // ── Helpers ────────────────────────────────────────────
  const addStream = (pid, stream) =>
    setRemoteStreams(p => p.find(s => s.id === pid) ? p : [...p, { id: pid, stream }]);

  const dropStream = (pid) => {
    setRemoteStreams(p => p.filter(s => s.id !== pid));
    setPeerNames(p => { const n = { ...p }; delete n[pid]; return n; });
  };

  const setupData = (conn) => {
    const s = R.current;
    if (!s || s.dataConns[conn.peer]?.open) return;
    s.dataConns[conn.peer] = conn;

    conn.on('open',  () => conn.send({ type: 'hello', name: userId }));
    conn.on('close', () => { if (!s.destroyed) { delete s.dataConns[conn.peer]; dropStream(conn.peer); } });
    conn.on('error', () => { if (!s.destroyed)  delete s.dataConns[conn.peer]; });
    conn.on('data',  (msg) => {
      if (!s || s.destroyed) return;
      switch (msg.type) {
        case 'hello': setPeerNames(p => ({ ...p, [conn.peer]: msg.name })); break;
        case 'peers': msg.list.forEach(pid => { if (pid !== s.myId) callPeer(pid); }); break;
        case 'chat':  setMessages(p => [...p, { ...msg, id: rand(), ts: Date.now() }]); break;
        case 'reaction': setReactions(p => [...p, { ...msg, id: rand() }]); break;
        default: break;
      }
    });
  };

  const callPeer = (pid) => {
    const s = R.current;
    if (!s || !s.myPeer || pid === s.myId || s.mediaCons[pid] || !localStream) return;

    if (!s.dataConns[pid]?.open) {
      const dc = s.myPeer.connect(pid, { reliable: true });
      setupData(dc);
    }
    const call = s.myPeer.call(pid, localStream);
    s.mediaCons[pid] = call;
    call.on('stream', r  => addStream(pid, r));
    call.on('close',  () => { if (!s?.destroyed) { delete s.mediaCons[pid]; dropStream(pid); } });
    call.on('error',  () => { if (!s?.destroyed)   delete s.mediaCons[pid]; });
  };

  // ── Coordinator (first peer = room host) ──────────────
  const tryCoordinator = (stream) => {
    const s = R.current;
    if (!s || s.destroyed) return;

    const coordId = `r${clean(roomId)}c`;
    setPeerStep('Szoba koordinátor keresése...');
    const cp = new Peer(coordId, PEER_CONFIG);
    s.coordPeer = cp;

    const timeout = setTimeout(() => {
      if (!s.isCoord && !s.destroyed) {
        cp.destroy();
        s.coordPeer = null;
        joinRoom(stream);
      }
    }, 5000);

    cp.on('open', () => {
      clearTimeout(timeout);
      if (s.destroyed) return;
      s.isCoord = true;
      s.members.add(s.myId);
      setPeerStep('Te vagy a koordinátor');

      cp.on('connection', (conn) => {
        const gid = conn.peer;
        conn.on('open', () => {
          if (s.destroyed) return;
          if (s.members.size >= 4) { conn.send({ type: 'full' }); conn.close(); return; }
          const existing = [...s.members].filter(id => id !== gid);
          conn.send({ type: 'peers', list: existing });
          s.members.add(gid);
          s.memberConns[gid] = conn;
          existing.filter(id => id !== s.myId)
            .forEach(id => s.memberConns[id]?.send({ type: 'peers', list: [gid] }));
          callPeer(gid);
        });
        conn.on('close', () => { s.members.delete(gid); delete s.memberConns[gid]; });
      });
    });

    cp.on('error', (err) => {
      clearTimeout(timeout);
      if (s.destroyed) return;
      if (err.type === 'unavailable-id') {
        // Coordinator taken — join as guest
        cp.destroy();
        s.coordPeer = null;
        joinRoom(stream);
      } else {
        setPeerStep(`Koordinátor hiba: ${err.type}, újra...`);
        setTimeout(() => { if (!s.destroyed) joinRoom(stream); }, 2000);
      }
    });
  };

  const joinRoom = (stream) => {
    const s = R.current;
    if (!s || !s.myPeer || s.destroyed) return;

    const coordId = `r${clean(roomId)}c`;
    setPeerStep('Csatlakozás a szobához...');
    const conn = s.myPeer.connect(coordId, { reliable: true });

    conn.on('data', (msg) => {
      if (!s || s.destroyed) return;
      if (msg.type === 'full') { setPeerStatus('full'); return; }
      if (msg.type === 'peers') msg.list.forEach(pid => { if (pid !== s.myId) callPeer(pid); });
    });

    conn.on('close', () => {
      if (s.destroyed) return;
      setPeerStep('Koordinátor kilépett, átveszem...');
      setTimeout(() => { if (!s.destroyed) tryCoordinator(stream); }, 1500);
    });

    conn.on('error', () => {
      if (s.destroyed) return;
      setPeerStep('Nem elérhető a szoba, újra...');
      setTimeout(() => { if (!s.destroyed) joinRoom(stream); }, 3000);
    });
  };

  // ── Main effect ────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !userId || !localStream) return;
    initRef();
    const s = R.current;

    setPeerStatus('connecting');
    setPeerStep('PeerJS kapcsolat indítása...');

    const myId = `ru${clean(roomId)}${rand()}`;
    s.myId = myId;

    const peer = new Peer(myId, PEER_CONFIG);
    s.myPeer = peer;

    // Timeout: if no open event after 12s, show error
    const openTimeout = setTimeout(() => {
      if (!s.destroyed && s.myPeer && !s.myPeer.open) {
        setPeerStatus('error');
        setPeerStep('A PeerJS szerver nem válaszol. Frissítsd az oldalt!');
      }
    }, 12000);

    peer.on('open', () => {
      clearTimeout(openTimeout);
      if (s.destroyed) return;
      setPeerStatus('online');
      setPeerStep('Saját kapcsolat OK');

      peer.on('call', (call) => {
        const cid = call.peer;
        if (s.mediaCons[cid]) return;
        s.mediaCons[cid] = call;
        call.answer(localStream);
        call.on('stream', r  => addStream(cid, r));
        call.on('close',  () => { if (!s?.destroyed) { delete s.mediaCons[cid]; dropStream(cid); } });
      });

      peer.on('connection', (conn) => setupData(conn));
      tryCoordinator(localStream);
    });

    peer.on('error', (err) => {
      clearTimeout(openTimeout);
      if (!s.destroyed) {
        setPeerStatus('error');
        setPeerStep(`Hiba: ${err.type} — Frissítsd az oldalt!`);
      }
    });

    peer.on('disconnected', () => {
      if (!s.destroyed) {
        setPeerStep('Kapcsolat megszakadt, újracsatlakozás...');
        peer.reconnect();
      }
    });

    return () => {
      clearTimeout(openTimeout);
      if (R.current) R.current.destroyed = true;
      peer.destroy();
      s.coordPeer?.destroy();
    };
  }, [roomId, userId, localStream]); // eslint-disable-line

  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text };
    Object.values(R.current?.dataConns ?? {}).forEach(c => { if (c.open) c.send(msg); });
    setMessages(p => [...p, { ...msg, id: rand(), ts: Date.now() }]);
  };

  const sendReaction = (emoji) => {
    const r = { type: 'reaction', emoji, sender: userId };
    Object.values(R.current?.dataConns ?? {}).forEach(c => { if (c.open) c.send(r); });
    setReactions(p => [...p, { ...r, id: rand() }]);
  };

  return { remoteStreams, messages, reactions, peerStatus, peerStep, peerNames, sendMessage, sendReaction };
};
