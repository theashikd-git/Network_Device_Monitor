/* ============================================================
   NETMON — chart.js
   A small, dependency-free canvas line chart, purpose-built for
   streaming metric history (CPU / Memory). No charting library
   needed — this keeps the "vanilla JS" brief intact.
   ============================================================ */

class LiveLineChart {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} opts
   * @param {string} opts.color        - line/fill color (CSS color string)
   * @param {number} opts.maxPoints    - how many samples to keep on screen
   * @param {number} opts.max          - y-axis max value (e.g. 100 for %)
   * @param {string} [opts.unit]       - unit suffix for the floating label
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.color = opts.color;
    this.maxPoints = opts.maxPoints || 30;
    this.max = opts.max || 100;
    this.unit = opts.unit || '%';
    this.data = [];
    this._resizeObserver = new ResizeObserver(() => this.draw());
    this._resizeObserver.observe(canvas);
  }

  push(value) {
    this.data.push(value);
    if (this.data.length > this.maxPoints) this.data.shift();
    this.draw();
  }

  _setupCanvasScale() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  draw() {
    if (!this.canvas.isConnected) return;
    const { w, h } = this._setupCanvasScale();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    if (this.data.length < 2) return;

    const padding = 6;
    const usableH = h - padding * 2;
    const stepX = (w - padding * 2) / (this.maxPoints - 1);
    const offset = this.maxPoints - this.data.length;

    const xAt = (i) => padding + (offset + i) * stepX;
    const yAt = (v) => padding + usableH - (Utils.clamp(v, 0, this.max) / this.max) * usableH;

    // Gridlines (25/50/75%)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((frac) => {
      const y = padding + usableH * (1 - frac);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(w - padding, y);
      ctx.stroke();
    });

    // Filled area under the line
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(this.data[0]));
    for (let i = 1; i < this.data.length; i++) ctx.lineTo(xAt(i), yAt(this.data[i]));
    ctx.lineTo(xAt(this.data.length - 1), h - padding);
    ctx.lineTo(xAt(0), h - padding);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, this._withAlpha(this.color, 0.25));
    gradient.addColorStop(1, this._withAlpha(this.color, 0));
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line itself
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(this.data[0]));
    for (let i = 1; i < this.data.length; i++) ctx.lineTo(xAt(i), yAt(this.data[i]));
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Latest-point marker
    const lastX = xAt(this.data.length - 1);
    const lastY = yAt(this.data[this.data.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }

  _withAlpha(color, alpha) {
    // Accepts hex like #5EE6A6 and returns rgba()
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  destroy() {
    this._resizeObserver.disconnect();
  }
}
