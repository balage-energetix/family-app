import { useEffect, useState, useRef, useCallback } from 'react';
import { Peer } from 'peerjs';

export const useFamilySync = (roomId, userId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [connected, setConnected] = useState(false);
  const [activeSlot, setActiveSlot] = useState(null);
  const [peerNames, setPeerNames] = useState({});
  
  const peerRef = useRef(null);
  const connectionsRef = useRef({}); 
  const callsRef = useRef({});
  const intervalRef = useRef(null);

  const addRemoteStream = useCallback((peerId, stream) => {
    setRemoteStreams(prev => {
      if (prev.find(s => s.id === peerId)) return prev;
      return [...prev, { id: peerId, stream }];
    });
  }, []);

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
        setMessages(prev => [...prev, { ...data, timestamp: Date.now() }]);
      } else if (data.type === 'reaction') {
        setReactions(prev => [...prev, { ...data, id: Math.random(), timestamp: Date.now() }]);
      }
    });

    conn.on('close', () => {
      delete connectionsRef.current[conn.peer];
      setRemoteStreams(prev => prev.filter(s => s.id !== conn.peer));
    });
  }, [userId]);

  const startDiscovery = useCallback((peer, stream, mySlot) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    intervalRef.current = setInterval(() => {
      if (!peer || peer.destroyed) return;
      
      for (let i = 1; i <= 6; i++) { // Back to 6 slots to reduce noise
        if (i === mySlot) continue;
        const otherId = `${roomId}-v3-slot-${i}`;
        
        // Data connection check
        if (!connectionsRef.current[otherId]) {
          const conn = peer.connect(otherId, { reliable: true });
          conn.on('open', () => setupDataConnection(conn));
        }

        // Call check - store call ref IMMEDIATELY to prevent double calling
        if (!callsRef.current[otherId] && stream) {
          const call = peer.call(otherId, stream);
          callsRef.current[otherId] = call; // Mark as calling
          
          call.on('stream', (remoteStream) => {
            addRemoteStream(otherId, remoteStream);
          });
          
          call.on('close', () => {
            delete callsRef.current[otherId];
            setRemoteStreams(prev => prev.filter(s => s.id !== otherId));
          });

          call.on('error', () => {
            delete callsRef.current[otherId];
          });
        }
      }
    }, 4000); // Slower interval
  }, [roomId, setupDataConnection, addRemoteStream]);

  const initPeer = useCallback(async () => {
    if (!roomId) return;
    
    peerRef.current?.destroy();
    setRemoteStreams([]);
    setConnected(false);

    let stream = localStream;
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720 }, 
          audio: { echoCancellation: true, noiseSuppression: true } 
        });
        setLocalStream(stream);
      } catch (err) {
        console.error('Media error', err);
      }
    }

    for (let i = 1; i <= 6; i++) {
      const potentialId = `${roomId}-v3-slot-${i}`;
      const peer = new Peer(potentialId);
      
      const success = await new Promise((resolve) => {
        peer.on('open', () => resolve(true));
        peer.on('error', (err) => resolve(false));
        setTimeout(() => resolve(false), 3000);
      });

      if (success) {
        peerRef.current = peer;
        setActiveSlot(i);
        setConnected(true);
        
        peer.on('call', (call) => {
          if (callsRef.current[call.peer]) return;
          callsRef.current[call.peer] = call;
          call.answer(stream);
          call.on('stream', (remoteStream) => {
            addRemoteStream(call.peer, remoteStream);
          });
        });

        peer.on('connection', (conn) => setupDataConnection(conn));
        startDiscovery(peer, stream, i);
        break;
      } else {
        peer.destroy();
      }
    }
  }, [roomId, localStream, startDiscovery, setupDataConnection, addRemoteStream]);

  useEffect(() => {
    initPeer();
    return () => {
      peerRef.current?.destroy();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [roomId, initPeer]);

  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text };
    Object.values(connectionsRef.current).forEach(conn => {
      if (conn.open) conn.send(msg);
    });
    setMessages(prev => [...prev, { ...msg, timestamp: Date.now() }]);
  };

  const sendReaction = (emoji) => {
    const reaction = { type: 'reaction', emoji, sender: userId };
    Object.values(connectionsRef.current).forEach(conn => {
      if (conn.open) conn.send(reaction);
    });
    setReactions(prev => [...prev, { ...reaction, id: Math.random(), timestamp: Date.now() }]);
  };

  return {
    localStream,
    remoteStreams,
    messages,
    reactions,
    connected,
    activeSlot,
    peerNames,
    sendMessage,
    sendReaction,
    reconnect: initPeer
  };
};
