import { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';

const MAX_PEERS = 4;

export const useFamilySync = (roomId, userId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | connecting | connected
  const [peerNames, setPeerNames] = useState({});
  const [mediaError, setMediaError] = useState(null);

  // Stable refs — never cause re-renders
  const stateRef = useRef({
    peer: null,
    hostPeer: null,
    myId: null,
    isHost: false,
    stream: null,
    // Map of peerId -> DataConnection
    dataConns: {},
    // Map of peerId -> MediaConnection
    mediaConns: {},
    // Set of peerId known to be in room (host tracks this)
    memberIds: new Set(),
    // Track members' host data connections (host only)
    memberConns: {},
  });

  // ─────────────────────────────────────────────
  // Helper: Add a remote video stream (no duplicates)
  // ─────────────────────────────────────────────
  const addStream = (peerId, stream) => {
    setRemoteStreams(prev =>
      prev.find(s => s.id === peerId) ? prev : [...prev, { id: peerId, stream }]
    );
  };

  const removeStream = (peerId) => {
    setRemoteStreams(prev => prev.filter(s => s.id !== peerId));
    setPeerNames(prev => { const n = { ...prev }; delete n[peerId]; return n; });
  };

  // ─────────────────────────────────────────────
  // Setup a data connection (incoming or outgoing)
  // ─────────────────────────────────────────────
  const setupDataConn = (conn, stream) => {
    const s = stateRef.current;
    if (s.dataConns[conn.peer]?.open) return;
    s.dataConns[conn.peer] = conn;

    conn.on('open', () => {
      // Introduce ourselves
      conn.send({ type: 'identity', name: userId });
    });

    conn.on('data', (data) => {
      switch (data.type) {
        case 'identity':
          setPeerNames(prev => ({ ...prev, [conn.peer]: data.name }));
          break;
        case 'chat':
          setMessages(prev => [...prev, { ...data, id: crypto.randomUUID(), ts: Date.now() }]);
          break;
        case 'reaction':
          setReactions(prev => [...prev, { ...data, id: crypto.randomUUID() }]);
          break;
        case 'peer-list':
          // Host sent us the list of existing peers → call each one
          data.peers.forEach(pid => {
            if (pid !== s.myId) initiateConnection(pid, stream ?? s.stream);
          });
          break;
        default: break;
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

  // ─────────────────────────────────────────────
  // Initiate full connection to a known peer
  // ─────────────────────────────────────────────
  const initiateConnection = (targetId, stream) => {
    const s = stateRef.current;
    if (!s.peer || targetId === s.myId) return;
    if (s.dataConns[targetId]?.open) return;

    // Data channel
    const conn = s.peer.connect(targetId, { reliable: true });
    setupDataConn(conn, stream);

    // Video call
    if (stream && !s.mediaConns[targetId]) {
      const call = s.peer.call(targetId, stream);
      s.mediaConns[targetId] = call;
      call.on('stream', remote => addStream(targetId, remote));
      call.on('close', () => {
        delete s.mediaConns[targetId];
        removeStream(targetId);
      });
    }
  };

  // ─────────────────────────────────────────────
  // Start as HOST for the room
  // ─────────────────────────────────────────────
  const becomeHost = (stream) => {
    const s = stateRef.current;
    const hostId = `${roomId}--host`;
    const hostPeer = new Peer(hostId);
    s.hostPeer = hostPeer;

    hostPeer.on('open', () => {
      s.isHost = true;
      s.memberIds.add(s.myId);

      hostPeer.on('connection', (conn) => {
        conn.on('open', () => {
          // Room full?
          if (s.memberIds.size >= MAX_PEERS) {
            conn.send({ type: 'room-full' });
            conn.close();
            return;
          }

          // Send existing member list to the new joiner
          const existing = Array.from(s.memberIds);
          conn.send({ type: 'peer-list', peers: existing });

          // Add new member and notify others
          s.memberIds.add(conn.peer);
          s.memberConns[conn.peer] = conn;

          // Announce new peer to existing members
          existing.filter(id => id !== s.myId).forEach(existingId => {
            s.memberConns[existingId]?.send({ type: 'peer-list', peers: [conn.peer] });
          });

          // Also initiate connection from host to new member
          initiateConnection(conn.peer, stream);
        });

        conn.on('close', () => {
          s.memberIds.delete(conn.peer);
          delete s.memberConns[conn.peer];
        });
      });
    });

    hostPeer.on('error', () => {
      // Host ID already taken — join as guest
      s.hostPeer = null;
      joinAsGuest(stream);
    });
  };

  // ─────────────────────────────────────────────
  // Join existing room as GUEST
  // ─────────────────────────────────────────────
  const joinAsGuest = (stream) => {
    const s = stateRef.current;
    const hostId = `${roomId}--host`;
    const conn = s.peer.connect(hostId, { reliable: true });

    conn.on('open', () => {
      conn.send({ type: 'join', id: s.myId });
    });

    conn.on('data', (data) => {
      if (data.type === 'room-full') {
        setStatus('room-full');
        return;
      }
      if (data.type === 'peer-list') {
        data.peers.forEach(pid => {
          if (pid !== s.myId) initiateConnection(pid, stream);
        });
      }
    });

    conn.on('close', () => {
      // Host disconnected — try to become new host
      setTimeout(() => becomeHost(s.stream), 1500);
    });
  };

  // ─────────────────────────────────────────────
  // Main effect
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !userId) return;

    const s = stateRef.current;
    setStatus('connecting');

    const run = async () => {
      // 1) Get camera/mic
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        s.stream = stream;
        setLocalStream(stream);
      } catch (err) {
        setMediaError(err.name === 'NotAllowedError'
          ? 'Kamera/mikrofon hozzáférés megtagadva. Engedélyezd a böngészőben!'
          : 'Nem sikerült elérni a kamerát vagy mikrofont.');
        return;
      }

      // 2) Create our unique peer
      const myId = `${roomId}--u--${crypto.randomUUID().slice(0, 8)}`;
      s.myId = myId;
      const peer = new Peer(myId);
      s.peer = peer;

      peer.on('open', () => {
        setStatus('connected');

        // Handle incoming calls
        peer.on('call', (call) => {
          const callerPeer = call.peer;
          if (s.mediaConns[callerPeer]) return; // already connected
          s.mediaConns[callerPeer] = call;
          call.answer(stream);
          call.on('stream', remote => addStream(callerPeer, remote));
          call.on('close', () => {
            delete s.mediaConns[callerPeer];
            removeStream(callerPeer);
          });
        });

        // Handle incoming data connections
        peer.on('connection', (conn) => setupDataConn(conn, stream));

        // Try to become host first; if taken, join as guest
        becomeHost(stream);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
      });
    };

    run();

    return () => {
      const s = stateRef.current;
      s.peer?.destroy();
      s.hostPeer?.destroy();
      s.stream?.getTracks().forEach(t => t.stop());
      // Reset state
      stateRef.current = {
        peer: null, hostPeer: null, myId: null, isHost: false, stream: null,
        dataConns: {}, mediaConns: {}, memberIds: new Set(), memberConns: {},
      };
    };
  }, [roomId, userId]);

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────
  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text };
    Object.values(stateRef.current.dataConns).forEach(c => { if (c.open) c.send(msg); });
    setMessages(prev => [...prev, { ...msg, id: crypto.randomUUID(), ts: Date.now() }]);
  };

  const sendReaction = (emoji) => {
    const r = { type: 'reaction', emoji, sender: userId };
    Object.values(stateRef.current.dataConns).forEach(c => { if (c.open) c.send(r); });
    setReactions(prev => [...prev, { ...r, id: crypto.randomUUID() }]);
  };

  return {
    localStream,
    remoteStreams,
    messages,
    reactions,
    status,
    peerNames,
    mediaError,
    sendMessage,
    sendReaction,
  };
};
