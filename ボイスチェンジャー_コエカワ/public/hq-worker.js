// 高品質エンジンを画面の裏(別スレッド)で動かす。長い録音でも画面が固まらない
import { convertHQ } from "./hq-engine.js";

self.onmessage = (e) => {
  const { data, sampleRate, opts } = e.data;
  try {
    const out = convertHQ(data, sampleRate, { ...opts, onProgress: (p) => self.postMessage({ progress: p }) });
    self.postMessage({ done: out }, [out.buffer]);
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
