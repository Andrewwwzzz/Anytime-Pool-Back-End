const axios = require("axios");

// 🔥 change this to your ESP32 endpoint later (or multiple)
const DEVICE_MAP = {
  // tableId (hardware_id) → ESP32 URL
  "table1": "http://172.20.10.3"
};

exports.turnOn = async (tableId) => {
  try {
    const url = DEVICE_MAP[tableId];
    if (!url) return;

    await axios.get(`${url}/on`);
    console.log("Relay ON:", tableId);
  } catch (err) {
    console.log("Device ON error:", err.message);
  }
};

exports.turnOff = async (tableId) => {
  try {
    const url = DEVICE_MAP[tableId];
    if (!url) return;

    await axios.get(`${url}/off`);
    console.log("Relay OFF:", tableId);
  } catch (err) {
    console.log("Device OFF error:", err.message);
  }
};