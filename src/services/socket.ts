import { io } from 'socket.io-client';
import { remote_url } from "../constants/api";

export let pc_id = null;

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
    } else {
        console.log("[BRIDGE] Still waiting... Remote Connected:", remoteSocket.connected, "PC_ID:", pc_id);
    }
};

const setupLocalListeners = () => {
    localSocket.on("pc_stats", (data) => {
        pc_id = data.pcId;
        console.log("[LOCAL] Received pc_stats. ID:", pc_id);
        tryJoinRemote();
    });
};

const setupRemoteListeners = () => {
    remoteSocket.on('connect', () => {
        console.log("[REMOTE] Socket connected to:", remote_url);
        tryJoinRemote();
    });

    remoteSocket.on("deviceJoined", (id) => {
        console.log("[REMOTE] Server confirmed join for device:", id);

    });

    remoteSocket.on("deviceActivated", (data) => {
        console.log("[REMOTE] Received activation signal. Relaying to local hardware...");
    });

    remoteSocket.on("connect_error", (err) => {
        console.error("[REMOTE] Connection Error:", err.message);
    });
};

setupLocalListeners();
setupRemoteListeners();