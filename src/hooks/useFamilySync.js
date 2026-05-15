import { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';

// Generate a short random alphanumeric string (PeerJS safe)
const randId = () => Math.random().toString(36).slice(2, 8);

export const useFamilySync = (roomId, userId) => {
  const [localStream, setLocalStream]   = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages]         = useState([]);
  const [reactions, setReactions]       = useState([]);
  const [status, setStatus]             = useState('idle');
  const [peerNames, setPeerNames]       = useState({});
  const [mediaError, setMediaError]     = useState(null);

  // All mutable state lives in a ref so closures never go stale
  const R = useRef({
    myPeer:   null,   // our own Peer (random ID)
    hostPeer: null,   // only set if we are the host
    myId:     null,
    isHost:   false,
    stream:   null,
    dataConns: {},    // peerId → DataConnection
    mediaCons: {},    // peerId → MediaConnection
    members:  new Set(), // host only: IDs of everyone in room
    memberConns: {},  // host only: peerId → DataConnection to host
  });

  // ── Stable helpers ────────────────────────────────────────
  const addStream = (pid, stream) =>
    setRemoteStreams(prev => prev.find(s => s.id === pid) ? prev : [...prev, { id: pid, stream }]);

  const removeStream = (pid) => {
    setRemoteStreams(prev => prev.filter(s => s.id !== pid));
    setPeerNames(prev => { const n = { ...prev }; delete n[pid]; return n; });
  };

  // Setup a data channel (both sides)
  const setupData = (conn) => {
    const s = R.current;
    if (s.dataConns[conn.peer]?.open) return;
    s.dataConns[conn.peer] = conn;

    conn.on('open', () => {
      conn.send({ type: 'hello', name: userId });
    });

    conn.on('data', (msg) => {
      if (msg.type === 'hello') {
        setPeerNames(prev => ({ ...prev, [conn.peer]: msg.name }));

      } else if (msg.type === 'peers') {
        // Host told us who else is in the room — call each one
        msg.list.forEach(pid => {
          if (pid !== s.myId) callPeer(pid);
        });

      } else if (msg.type === 'chat') {
        setMessages(prev => [...prev, { ...msg, id: randId(), ts: Date.now() }]);

      } else if (msg.type === 'reaction') {
        setReactions(prev => [...prev, { ...msg, id: randId() }]);
      }
    });

    conn.on('close', () => {
      delete s.dataConns[conn.peer];
      removeStream(conn.peer);
    });

    conn.on('error', () => {
      delete s.dataConns[conn.peer];
    });
  };

  // Call a peer for video (one-directional initiation)
  const callPeer = (pid) => {
    const s = R.current;
    if (!s.myPeer || pid === s.myId || s.mediaCons[pid]) return;
    const stream = s.stream;
    if (!stream) return;

    // Data channel first (if not yet open)
    if (!s.dataConns[pid]?.open) {
      const conn = s.myPeer.connect(pid, { reliable: true });
      setupData(conn);
    }

    const call = s.myPeer.call(pid, stream);
    s.mediaCons[pid] = call;
    call.on('stream', remote => addStream(pid, remote));
    call.on('close',  () => { delete s.mediaCons[pid]; removeStream(pid); });
    call.on('error',  () => { delete s.mediaCons[pid]; });
  };

  // ── Host logic ────────────────────────────────────────────
  const startAsHost = (stream) => {
    const s = R.current;
    // Safe host ID: only letters, numbers, single hyphens
    const hostId = `fc-${roomId.replace(/[^a-z0-9]/gi, '')}-host`;
    const hostPeer = new Peer(hostId);
    s.hostPeer = hostPeer;

    hostPeer.on('open', () => {
      s.isHost = true;
      s.members.add(s.myId);
      console.log('[Host] Started as host:', hostId);

      hostPeer.on('connection', (conn) => {
        const guestId = conn.peer;

        conn.on('open', () => {
          if (s.members.size >= 4) {
            conn.send({ type: 'full' });
            conn.close();
            return;
          }

          // Send guest the current member list (excluding itself)
          const existing = Array.from(s.members).filter(id => id !== guestId);
          conn.send({ type: 'peers', list: existing });

          // Track the guest
          s.members.add(guestId);
          s.memberConns[guestId] = conn;

          // Tell existing members about the new guest
          existing.filter(id => id !== s.myId).forEach(id => {
            s.memberConns[id]?.send({ type: 'peers', list: [guestId] });
          });

          // Host calls the new guest for video
          callPeer(guestId);
        });

        conn.on('close', () => {
          s.members.delete(guestId);
          delete s.memberConns[guestId];
        });
      });
    });

    hostPeer.on('error', (err) => {
      // Host slot taken → join as guest
      console.log('[Host] Slot taken, joining as guest. Err:', err.type);
      s.hostPeer = null;
      joinAsGuest(stream);
    });
  };

  // ── Guest logic ───────────────────────────────────────────
  const joinAsGuest = (stream) => {
    const s = R.current;
    const hostId = `fc-${roomId.replace(/[^a-z0-9]/gi, '')}-host`;
    console.log('[Guest] Connecting to host:', hostId);

    const conn = s.myPeer.connect(hostId, { reliable: true });

    conn.on('open', () => {
      console.log('[Guest] Connected to host');
    });

    conn.on('data', (msg) => {
      if (msg.type === 'full') {
        setStatus('full');
        return;
      }
      if (msg.type === 'peers') {
        msg.list.forEach(pid => {
          if (pid !== s.myId) callPeer(pid);
        });
      }
    });

    conn.on('close', () => {
      // Host left — wait a moment then try to become new host
      console.log('[Guest] Host disconnected. Taking over in 2s...');
      setTimeout(() => startAsHost(stream), 2000);
    });

    conn.on('error', () => {
      // Could not reach host yet — retry in 2 seconds
      console.log('[Guest] Host not reachable, retrying...');
      setTimeout(() => joinAsGuest(stream), 2000);
    });
  };

  // ── Main effect ───────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !userId) return;

    const s = R.current;
    setStatus('connecting');

    let cancelled = false;

    const run = async () => {
      // 1. Get camera + mic
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        s.stream = stream;
        setLocalStream(stream);
      } catch (err) {
        if (!cancelled) {
          setMediaError(
            err.name === 'NotAllowedError'
              ? 'Kamera/mikrofon hozzáférés megtagadva. Engedélyezd a böngészőben, majd frissíts!'
              : 'Nem sikerült elérni a kamerát vagy mikrofont.'
          );
        }
        return;
      }

      // 2. Create our unique peer (PeerJS-safe alphanumeric ID)
      const myId = `fc-${roomId.replace(/[^a-z0-9]/gi, '')}-u-${randId()}`;
      s.myId = myId;
      const myPeer = new Peer(myId);
      s.myPeer = myPeer;

      myPeer.on('open', () => {
        if (cancelled) return;
        console.log('[Peer] Open:', myId);
        setStatus('connected');

        // Handle incoming video calls
        myPeer.on('call', (call) => {
          const cid = call.peer;
          if (s.mediaCons[cid]) return; // ignore duplicates
          s.mediaCons[cid] = call;
          call.answer(stream);
          call.on('stream', remote => addStream(cid, remote));
          call.on('close',  () => { delete s.mediaCons[cid]; removeStream(cid); });
          call.on('error',  () => { delete s.mediaCons[cid]; });
        });

        // Handle incoming data connections
        myPeer.on('connection', (conn) => setupData(conn));

        // Try to become the room host first
        startAsHost(stream);
      });

      myPeer.on('error', (err) => {
        console.error('[Peer] Error:', err.type, err.message);
        if (!cancelled) setStatus('error');
      });

      myPeer.on('disconnected', () => {
        if (!cancelled) myPeer.reconnect();
      });
    };

    run();

    return () => {
      cancelled = true;
      const s = R.current;
      s.myPeer?.destroy();
      s.hostPeer?.destroy();
      s.stream?.getTracks().forEach(t => t.stop());
      R.current = {
        myPeer: null, hostPeer: null, myId: null, isHost: false, stream: null,
        dataConns: {}, mediaCons: {}, members: new Set(), memberConns: {},
      };
      setLocalStream(null);
      setRemoteStreams([]);
      setStatus('idle');
    };
  }, [roomId, userId]); // eslint-disable-line

  // ── Send helpers ──────────────────────────────────────────
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

  return {
    localStream, remoteStreams, messages, reactions,
    status, peerNames, mediaError,
    sendMessage, sendReaction,
  };
};
