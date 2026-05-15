import { useEffect, useState, useRef, useCallback } from 'react';
import { Peer } from 'peerjs';

export const useFamilySync = (roomId, userId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [connected, setConnected] = useState(false);
  const [peerNames, setPeerNames] = useState({});
  
  const peerRef = useRef(null);
  const lobbyConnRef = useRef(null);
  const connectionsRef = useRef({}); 
  const callsRef = useRef({});
  const myIdRef = useRef(`${roomId}-user-${Math.random().toString(36).substr(2, 5)}`);
  const knownPeersRef = useRef(new Set());

  const addRemoteStream = useCallback((peerId, stream) => {
    setRemoteStreams(prev => {
      if (prev.find(s => s.id === peerId)) return prev;
      return [...prev, { id: peerId, stream }];
    });
  }, []);

  const connectToPeer = useCallback((targetPeerId, stream) => {
    if (targetPeerId === myIdRef.current || connectionsRef.current[targetPeerId]) return;

    const peer = peerRef.current;
    if (!peer) return;

    // Data connection
    const conn = peer.connect(targetPeerId, { reliable: true });
    setupDataConnection(conn);

    // Video call
    if (stream) {
      const call = peer.call(targetPeerId, stream);
      call.on('stream', (remoteStream) => {
        addRemoteStream(targetPeerId, remoteStream);
        callsRef.current[targetPeerId] = call;
      });
    }
  }, [addRemoteStream]);

  const setupDataConnection = useCallback((conn) => {
    if (connectionsRef.current[conn.peer]?.open) return;
    connectionsRef.current[conn.peer] = conn;
    
    conn.on('open', () => {
      conn.send({ type: 'identity', name: userId });
    });

    conn.on('data', (data) => {
      if (data.type === 'identity') {
        setPeerNames(prev => ({ ...prev, [conn.peer]: data.name }));
      } else if (data.type === 'chat') {
        setMessages(prev => [...prev, { ...data, timestamp: Date.now(), id: Math.random() }]);
      } else if (data.type === 'reaction') {
        setReactions(prev => [...prev, { ...data, id: Math.random() }]);
      } else if (data.type === 'peer-list') {
        // Lobby tells us who else is here
        data.peers.forEach(pId => {
          if (pId !== myIdRef.current) connectToPeer(pId, localStream);
        });
      }
    });

    conn.on('close', () => {
      delete connectionsRef.current[conn.peer];
      setRemoteStreams(prev => prev.filter(s => s.id !== conn.peer));
    });
  }, [userId, localStream, connectToPeer]);

  useEffect(() => {
    if (!roomId) return;

    const init = async () => {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
      } catch (err) {
        console.error('Media error', err);
      }

      const peer = new Peer(myIdRef.current);
      peerRef.current = peer;

      peer.on('open', (id) => {
        setConnected(true);
        
        // Try to find the Lobby (the "Signaling" peer for this room)
        const lobbyId = `${roomId}-lobby-master`;
        const lobbyConn = peer.connect(lobbyId);
        
        lobbyConn.on('open', () => {
          lobbyConnRef.current = lobbyConn;
          lobbyConn.send({ type: 'join', id: myIdRef.current });
        });

        // If we fail to connect to lobby, maybe WE are the lobby?
        // Actually, let's try to BE the lobby too
        const lobbyPeer = new Peer(lobbyId);
        lobbyPeer.on('open', () => {
          // I am the Lobby Master!
          lobbyPeer.on('connection', (conn) => {
            conn.on('data', (data) => {
              if (data.type === 'join') {
                knownPeersRef.current.add(data.id);
                // Broadcast the new peer list to everyone
                const peerList = Array.from(knownPeersRef.current);
                conn.send({ type: 'peer-list', peers: peerList });
              }
            });
          });
        });
        lobbyPeer.on('error', () => { /* Someone else is lobby, that's fine */ });
      });

      peer.on('call', (call) => {
        call.answer(stream);
        call.on('stream', (remoteStream) => {
          addRemoteStream(call.peer, remoteStream);
          callsRef.current[call.peer] = call;
        });
      });

      peer.on('connection', (conn) => setupDataConnection(conn));
    };

    init();

    return () => {
      peerRef.current?.destroy();
      localStream?.getTracks().forEach(t => t.stop());
    };
  }, [roomId, setupDataConnection, addRemoteStream]);

  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text, id: Math.random() };
    const sentTo = new Set();
    Object.values(connectionsRef.current).forEach(conn => {
      if (conn.open && !sentTo.has(conn.peer)) {
        conn.send(msg);
        sentTo.add(conn.peer);
      }
    });
    setMessages(prev => [...prev, { ...msg, timestamp: Date.now() }]);
  };

  const sendReaction = (emoji) => {
    const reaction = { type: 'reaction', emoji, sender: userId };
    Object.values(connectionsRef.current).forEach(conn => {
      if (conn.open) conn.send(reaction);
    });
    setReactions(prev => [...prev, { ...reaction, id: Math.random() }]);
  };

  return {
    localStream,
    remoteStreams,
    messages,
    reactions,
    connected,
    peerNames,
    sendMessage,
    sendReaction
  };
};
