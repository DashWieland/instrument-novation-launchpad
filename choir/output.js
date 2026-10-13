// Where Choir's sound goes: one device to hear it on, and optionally a copy
// to a second device, e.g. BlackHole 2ch for recording into a DAW. The rest
// of the Mac stays on its own output.
//
// The organ (vendor/.../audio.js) connects its last node to ctx.destination.
// Rather than edit it, it is given a stand-in context whose `destination` is
// our own bus: the bus feeds the context's real output (the "hear it on"
// device, chosen with AudioContext.setSinkId) and a MediaStream that an audio
// element plays on the second device (HTMLMediaElement.setSinkId). Chrome
// 110+.

export class Outputs {
  constructor(ctx) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.connect(ctx.destination);
    this.copy = null;            // { tap, element } while a second device is chosen
  }

  // The context to hand the organ: the real one, but `destination` is the bus.
  get context() {
    const { ctx, bus } = this;
    return new Proxy(ctx, {
      get(target, prop) {
        if (prop === 'destination') return bus;
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  }

  static supported() {
    return 'setSinkId' in AudioContext.prototype && 'setSinkId' in HTMLMediaElement.prototype;
  }

  // Audio outputs: [{ deviceId, label }]. Labels are empty until the page has
  // had microphone permission once (Chrome's rule), see showNames().
  static async list() {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'audiooutput').map(d => ({ deviceId: d.deviceId, label: d.label }));
  }

  // Ask for the microphone and close it at once, only so Chrome will name devices.
  static async showNames() {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
  }

  async hearOn(deviceId) {
    await this.ctx.setSinkId(deviceId === 'default' ? '' : deviceId);
  }

  // A copy of the sound on a second device, or none (null).
  async alsoSendTo(deviceId) {
    if (!deviceId) {
      if (this.copy) { this.copy.element.pause(); this.bus.disconnect(this.copy.tap); this.copy = null; }
      return;
    }
    if (!this.copy) {
      const tap = this.ctx.createMediaStreamDestination();
      this.bus.connect(tap);
      const element = new Audio();
      element.srcObject = tap.stream;
      this.copy = { tap, element };
    }
    await this.copy.element.setSinkId(deviceId === 'default' ? '' : deviceId);
    await this.copy.element.play();
  }
}
