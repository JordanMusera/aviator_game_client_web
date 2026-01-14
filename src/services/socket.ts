import { io } from 'socket.io-client';
import { remote_url } from "../constants/api";

export let pc_id: string | null = null;
let idListeners: ((id: string) => void)[] = [];

// Helper to let React components wait for the ID
export const onIdReady = (callback: (id: string) => void) => {
    if (pc_id) {
        callback(pc_id);
    } else {
        idListeners.push(callback);
    }
};

export const localSocket = io('http://localhost:8080', {
    transports: ['websocket'],
    upgrade: false
});

export const remoteSocket = io(`${remote_url}`, {
    transports: ['websocket'],
    upgrade: false
});

const tryJoinRemote = () => {
    if (remoteSocket.connected && pc_id) {
        console.log("[BRIDGE] Both ready. Joining room:", pc_id);
        remoteSocket.emit("joinDevice", pc_id);
    }
};

localSocket.on("pc_stats", (data) => {
    pc_id = data.pcId;
    console.log("[LOCAL] Received pc_stats. ID:", pc_id);

    // Trigger any React components waiting for this ID
    idListeners.forEach(fn => fn(pc_id!));
    idListeners = [];

    tryJoinRemote();
});

remoteSocket.on('connect', () => {
    console.log("[REMOTE] Socket connected");
    tryJoinRemote();
});

remoteSocket.on("connect_error", (err) => {
    console.error("[REMOTE] Connection Error:", err.message);
});