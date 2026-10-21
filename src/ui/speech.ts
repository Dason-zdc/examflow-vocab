/** 发音（Web Speech API）。不可用时静默降级——不阻塞学习流程。 */

export function speak(word: string, accent: 'uk' | 'us'): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(word);
    utter.lang = accent === 'uk' ? 'en-GB' : 'en-US';
    utter.rate = 0.9;
    synth.speak(utter);
  } catch {
    // 无语音环境：忽略
  }
}
