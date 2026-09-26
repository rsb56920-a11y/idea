// 測定用に、マイクの音を圧縮せずにそのまま受け取る(録音ファイルにすると音質が変わり、響きの測定がずれるため)
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("capture-processor", CaptureProcessor);
