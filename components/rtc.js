// Small WebRTC mesh: every participant connects directly to every other one.
// Signaling goes through the socket.io server ('signal' events).
// The newcomer always sends the offers, so there is no offer collision.
const DEFAULT_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

// STUN + (if configured in .env) TURN servers from our own server. TURN is what makes video work between different networks.
export async function fetchIce() {
  try {
    const res = await fetch('/api/ice');
    const j = await res.json();
    if (Array.isArray(j.iceServers) && j.iceServers.length) return j.iceServers;
  } catch {}
  return DEFAULT_ICE;
}

export function createRTC({ socket, localStream, onStream, onRemove, iceServers = DEFAULT_ICE }) {
  const ICE = { iceServers };
  const peers = new Map(); // id -> { pc, pending: [] }

  function makePeer(id) {
    const pc = new RTCPeerConnection(ICE);
    const peer = { pc, pending: [], remote: new MediaStream() };
    peers.set(id, peer);

    if (localStream) {
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    } else {
      // No camera/mic: still receive everyone else.
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('signal', { to: id, data: { candidate: e.candidate } });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] || peer.remote;
      if (!e.streams[0]) peer.remote.addTrack(e.track);
      onStream(id, stream);
      e.track.onunmute = () => onStream(id, stream);
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) close(id);
    };
    return peer;
  }

  async function call(id) {
    if (peers.has(id)) return;
    const { pc } = makePeer(id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { to: id, data: { sdp: pc.localDescription } });
  }

  async function handle({ from, data }) {
    let peer = peers.get(from);
    if (data.sdp) {
      if (!peer) peer = makePeer(from);
      const { pc } = peer;
      await pc.setRemoteDescription(data.sdp);
      for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      if (data.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: from, data: { sdp: pc.localDescription } });
      }
    } else if (data.candidate && peer) {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate).catch(() => {});
      else peer.pending.push(data.candidate);
    }
  }

  function close(id) {
    const peer = peers.get(id);
    if (!peer) return;
    peers.delete(id);
    try { peer.pc.close(); } catch {}
    onRemove(id);
  }

  function closeAll() { [...peers.keys()].forEach(close); }

  return { call, handle, close, closeAll };
}

// Ask for camera + mic. Falls back to mic only, then to nothing.
export async function getMedia() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return { stream: null, note: 'Camera/mic is browser mein available nahi (https ya localhost chahiye).' };
  }
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, frameRate: 20 }, audio }), note: '' };
  } catch {
    try {
      return { stream: await navigator.mediaDevices.getUserMedia({ audio }), note: 'Camera nahi mila, sirf mic chalu hai.' };
    } catch {
      return { stream: null, note: 'Camera/mic ki permission nahi mili. Aap dusron ko dekh sakte ho, par wo aapko nahi.' };
    }
  }
}
