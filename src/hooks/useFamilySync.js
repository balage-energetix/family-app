import { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';

const randId = () => Math.random().toString(36).slice(2, 8);
const safeRoom = (r) => r.replace(/[^a-z0-9]/gi, '').toLowerCase();

export const useFamilySync = (roomId, userId, localStream) => {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages,     setMessages]      = useState([]);
  const [reactions,    setReactions]     = useState([]);
  const [peerStatus,   setPeerStatus]    = useState('idle'); // idle|connecting|online
  const [peerNames,    setPeerNames]     = useState({});

  const R = useRef({
    myPeer: null, hostPeer: null,
    myId: null, stream: null,
    dataConns: {}, mediaCons: {},
    members: new Set(), memberConns: {},
  });

  const addStream = (pid, stream) =>
    setRemoteStreams(prev => prev.find(s => s.id === pid) ? prev : [...prev, { id: pid, stream }]);

  const removeStream = (pid) => {
    setRemoteStreams(prev => prev.filter(s => s.id !== pid));
    setPeerNames(prev => { const n = { ...prev }; delete n[pid]; return n; });
  };

  const setupData = (conn) => {
    const s = R.current;
    if (s.dataConns[conn.peer]?.open) return;
    s.dataConns[conn.peer] = conn;
    conn.on('open',  () => conn.send({ type: 'hello', name: userId }));
    conn.on('data',  handleMsg.bind(null, conn.peer));
    conn.on('close', () => { delete s.dataConns[conn.peer]; removeStream(conn.peer); });
    conn.on('error', () => { delete s.dataConns[conn.peer]; });
  };

  const handleMsg = (fromPeer, msg) => {
    const s = R.current;
    if (msg.type === 'hello') {
      setPeerNames(prev => ({ ...prev, [fromPeer]: msg.name }));
    } else if (msg.type === 'peers') {
      msg.list.forEach(pid => { if (pid !== s.myId) callPeer(pid); });
    } else if (msg.type === 'chat') {
      setMessages(prev => [...prev, { ...msg, id: randId(), ts: Date.now() }]);
    } else if (msg.type === 'reaction') {
      setReactions(prev => [...prev, { ...msg, id: randId() }]);
    }
  };

  const callPeer = (pid) => {
    const s = R.current;
    if (!s.myPeer || pid === s.myId || s.mediaCons[pid]) return;
    if (!s.dataConns[pid]?.open) {
      const conn = s.myPeer.connect(pid, { reliable: true });
      setupData(conn);
    }
    const call = s.myPeer.call(pid, s.stream);
    s.mediaCons[pid] = call;
    call.on('stream', remote => addStream(pid, remote));
    call.on('close',  () => { delete s.mediaCons[pid]; removeStream(pid); });
    call.on('error',  () => { delete s.mediaCons[pid]; });
  };

  const startHost = (stream) => {
    const s = R.current;
    const hostId = `fc${safeRoom(roomId)}host`;
    const hp = new Peer(hostId);
    s.hostPeer = hp;

    hp.on('open', () => {
      s.members.add(s.myId);
      hp.on('connection', (conn) => {
        const gid = conn.peer;
        conn.on('open', () => {
          if (s.members.size >= 4) { conn.send({ type: 'full' }); conn.close(); return; }
          conn.send({ type: 'peers', list: Array.from(s.members).filter(id => id !== gid) });
          s.members.add(gid);
          s.memberConns[gid] = conn;
          Array.from(s.members)
            .filter(id => id !== s.myId && id !== gid)
            .forEach(id => s.memberConns[id]?.send({ type: 'peers', list: [gid] }));
          callPeer(gid);
        });
        conn.on('close', () => { s.members.delete(gid); delete s.memberConns[gid]; });
      });
    });

    hp.on('error', () => { s.hostPeer = null; joinGuest(stream); });
  };

  const joinGuest = (stream) => {
    const s = R.current;
    const hostId = `fc${safeRoom(roomId)}host`;
    const conn = s.myPeer.connect(hostId, { reliable: true });
    conn.on('data', (msg) => {
      if (msg.type === 'full') { setPeerStatus('full'); return; }
      if (msg.type === 'peers') msg.list.forEach(pid => { if (pid !== s.myId) callPeer(pid); });
    });
    conn.on('close', () => setTimeout(() => startHost(stream), 1500));
    conn.on('error', () => setTimeout(() => joinGuest(stream), 2000));
  };

  // Main effect — runs only when we have a stream AND roomId/userId
  useEffect(() => {
    if (!roomId || !userId || !localStream) return;

    const s = R.current;
    s.stream = localStream;
    setPeerStatus('connecting');

    const myId = `fcu${safeRoom(roomId)}${randId()}`;
    s.myId = myId;
    const peer = new Peer(myId);
    s.myPeer = peer;

    peer.on('open', () => {
      setPeerStatus('online');
      peer.on('call', (call) => {
        const cid = call.peer;
        if (s.mediaCons[cid]) return;
        s.mediaCons[cid] = call;
        call.answer(localStream);
        call.on('stream', remote => addStream(cid, remote));
        call.on('close',  () => { delete s.mediaCons[cid]; removeStream(cid); });
      });
      peer.on('connection', (conn) => setupData(conn));
      startHost(localStream);
    });

    peer.on('error', (err) => console.error('PeerJS error:', err.type));
    peer.on('disconnected', () => peer.reconnect());

    return () => {
      peer.destroy();
      s.hostPeer?.destroy();
      R.current = {
        myPeer: null, hostPeer: null, myId: null, stream: null,
        dataConns: {}, mediaCons: {}, members: new Set(), memberConns: {},
      };
      setRemoteStreams([]);
      setPeerStatus('idle');
    };
  }, [roomId, userId, localStream]); // eslint-disable-line

  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text };
    Object.values(R.current.dataConns).forEach(c => { if (c.open) c.send(msg); });
    setMessages(prev => [...prev, { ...msg, id: randId(), ts: Date.now() }]);
  };

  const sendReaction = (emoji) => {
    const r = { type: 'reaction', emoji, sender: userId };
    Object.values(R.current.dataConns).forEach(c => { if (c.open) c.send(r); });
    setReactions(prev => [...prev, { ...r, id: randId() }]);
  };

  return { remoteStreams, messages, reactions, peerStatus, peerNames, sendMessage, sendReaction };
};
