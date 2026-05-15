import { useEffect, useState, useRef, useCallback } from 'react';
import { Peer } from 'peerjs';

export const useFamilySync = (roomId, userId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState({}); // Tracking call objects

  const peerRef = useRef(null);
  const connectionsRef = useRef({}); // Tracking data connections

  useEffect(() => {
    if (!roomId || !userId) return;

    const peerId = `${roomId}-${userId}`;
    const peer = new Peer(peerId);
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('My peer ID is: ' + id);
      setConnected(true);
      
      // Get media stream
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          setLocalStream(stream);
          
          // Answer incoming calls
          peer.on('call', (call) => {
            call.answer(stream);
            call.on('stream', (remoteStream) => {
              addRemoteStream(call.peer, remoteStream);
            });
            setPeers(prev => ({ ...prev, [call.peer]: call }));
          });
        })
        .catch(err => console.error('Failed to get local stream', err));
    });

    // Handle data connections
    peer.on('connection', (conn) => {
      setupDataConnection(conn);
    });

    return () => {
      peer.destroy();
      localStream?.getTracks().forEach(t => t.stop());
    };
  }, [roomId, userId]);

  const addRemoteStream = (peerId, stream) => {
    setRemoteStreams(prev => {
      if (prev.find(s => s.id === peerId)) return prev;
      return [...prev, { id: peerId, stream }];
    });
  };

  const setupDataConnection = (conn) => {
    connectionsRef.current[conn.peer] = conn;
    conn.on('data', (data) => {
      if (data.type === 'chat') {
        setMessages(prev => [...prev, { ...data, timestamp: Date.now() }]);
      } else if (data.type === 'reaction') {
        setReactions(prev => [...prev, { ...data, id: Math.random(), timestamp: Date.now() }]);
      }
    });
  };

  const connectToPeer = useCallback((otherUserId) => {
    const otherPeerId = `${roomId}-${otherUserId}`;
    if (!peerRef.current || peers[otherPeerId]) return;

    // Call for video
    if (localStream) {
      const call = peerRef.current.call(otherPeerId, localStream);
      call.on('stream', (remoteStream) => {
        addRemoteStream(otherPeerId, remoteStream);
      });
      setPeers(prev => ({ ...prev, [otherPeerId]: call }));
    }

    // Connect for data
    const conn = peerRef.current.connect(otherPeerId);
    conn.on('open', () => {
      setupDataConnection(conn);
    });
  }, [roomId, localStream, peers]);

  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text };
    Object.values(connectionsRef.current).forEach(conn => conn.send(msg));
    setMessages(prev => [...prev, { ...msg, timestamp: Date.now() }]);
  };

  const sendReaction = (emoji) => {
    const reaction = { type: 'reaction', emoji, sender: userId };
    Object.values(connectionsRef.current).forEach(conn => conn.send(reaction));
    setReactions(prev => [...prev, { ...reaction, id: Math.random(), timestamp: Date.now() }]);
  };

  return {
    localStream,
    remoteStreams,
    messages,
    reactions,
    connected,
    connectToPeer,
    sendMessage,
    sendReaction
  };
};
