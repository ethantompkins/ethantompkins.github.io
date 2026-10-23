/*
 * Small SVG chart renderer for the blog posts.
 *
 * A post sets <body data-charts="/assets/data/blog/<slug>.json">; every
 * <div class="chart" data-chart="<id>"> is drawn from charts[id] in that file.
 * The JSON is produced by the scripts in /analysis. Chart types: bar, line,
 * scatter, heatmap. Each chart gets a legend (2+ series) and a hover tooltip.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var COLORS = {
    1: '#2a78d6', 2: '#eb6834', 3: '#1baf7a', 4: '#eda100',
    5: '#e87ba4', 6: '#008300', 7: '#6250d6', 8: '#e34948',
    gray: '#bdbbb3', ink: '#52514e', good: '#0ca30c', critical: '#d03b3b'
  };
  var INK = { primary: '#212529', secondary: '#52514e', muted: '#898781', grid: '#ecebe6', axis: '#c3c2b7', surface: '#ffffff' };
  var SEQ = ['#eef5fe', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
  var DIV_LOW = ['#b8332f', '#e34948', '#f09a99', '#f7cfce'];
  var DIV_MID = '#f0efec';
  var DIV_HIGH = ['#cde2fb', '#86b6ef', '#2a78d6', '#184f95'];
  var FONT = 12;

  function color(c) { return COLORS[c] || c || COLORS[1]; }

  /* ---------- formatting ---------- */
  function fmt(kind, v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var minus = '−';
    function signed(n, d) {
      var a = Math.abs(n).toFixed(d);
      return (+a === 0 ? '' : n > 0 ? '+' : minus) + a;
    }
    switch (kind) {
      case 'pct0': return (v * 100).toFixed(0) + '%';
      case 'pct1': return (v * 100).toFixed(1) + '%';
      case 'pct2': return (v * 100).toFixed(2) + '%';
      case 'signed0': return signed(v, 0);
      case 'signed1': return signed(v, 1);
      case 'signed2': return signed(v, 2);
      case 'signed3': return signed(v, 3);
      case 'signed0pct': return signed(v * 100, 0) + '%';
      case 'signed1pct': return signed(v * 100, 1) + '%';
      case 'dec0': return v.toFixed(0).replace('-', minus);
      case 'dec1': return v.toFixed(1).replace('-', minus);
      case 'dec2': return v.toFixed(2).replace('-', minus);
      case 'dec3': return v.toFixed(3).replace('-', minus);
      case 'year': return String(Math.round(v));
      case 'int': return Math.round(v).toLocaleString().replace('-', minus);
      default: return String(+v.toFixed(3)).replace('-', minus);
    }
  }
  // Tick labels use just enough decimals to tell neighbouring ticks apart.
  function tickFmt(kind, v, step) {
    if (!step || !kind) return fmt(kind, v);
    if (/^signed\dpct$/.test(kind)) {
      return fmt('signed' + Math.max(0, Math.min(1, Math.ceil(-Math.log10(step * 100) - 1e-9))) + 'pct', v);
    }
    var family = kind.replace(/\d+$/, '');
    if (family !== 'pct' && family !== 'signed' && family !== 'dec') return fmt(kind, v);
    var s = family === 'pct' ? step * 100 : step;
    var decimals = Math.max(0, Math.min(3, Math.ceil(-Math.log10(s) - 1e-9)));
    return fmt(family + decimals, v);
  }

  /* ---------- scales ---------- */
  function niceStep(span, count) {
    var raw = span / Math.max(count, 1);
    var pow = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / pow;
    return (f >= 7.07 ? 10 : f >= 3.16 ? 5 : f >= 1.41 ? 2 : 1) * pow;
  }
  function ticks(min, max, count) {
    var step = niceStep(max - min, count);
    var out = [];
    for (var t = Math.ceil(min / step - 1e-9) * step; t <= max + step * 1e-6; t += step) out.push(+t.toFixed(10));
    out.step = step;
    return out;
  }
  // Drop ticks outside the domain, keeping the step used to format them.
  function keep(tks, dom) {
    var out = tks.filter(function (t) { return t >= dom[0] - 1e-9 && t <= dom[1] + 1e-9; });
    out.step = tks.step || (tks.length > 1 ? Math.abs(tks[1] - tks[0]) : undefined);
    return out;
  }
  function linear(d0, d1, r0, r1) {
    var s = function (v) { return r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0); };
    s.domain = [d0, d1];
    return s;
  }
  function extent(values, spec, padFrac, includeZero) {
    var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    if (includeZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    var pad = (hi - lo || Math.abs(hi) || 1) * (padFrac || 0);
    lo = spec && spec.min !== undefined ? spec.min : lo - (includeZero && lo === 0 ? 0 : pad);
    hi = spec && spec.max !== undefined ? spec.max : hi + pad;
    return [lo, hi];
  }
  function niceDomain(d, count) {
    var step = niceStep(d[1] - d[0], count);
    return [Math.floor(d[0] / step + 1e-9) * step, Math.ceil(d[1] / step - 1e-9) * step];
  }

  /* ---------- DOM helpers ---------- */
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, str, attrs) {
    var a = { x: x, y: y, fill: INK.muted, 'font-size': FONT };
    for (var k in attrs) a[k] = attrs[k];
    var t = el('text', a, parent);
    t.textContent = str;
    return t;
  }
  function html(tag, cls, parent, content) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (content !== undefined) n.textContent = content;
    if (parent) parent.appendChild(n);
    return n;
  }
  var measurer;
  function measure(str, size, weight) {
    if (!measurer) {
      var svg = el('svg', { width: 0, height: 0, style: 'position:absolute;visibility:hidden' });
      document.body.appendChild(svg);
      measurer = el('text', {}, svg);
    }
    measurer.setAttribute('font-size', size || FONT);
    measurer.setAttribute('font-weight', weight || 400);
    measurer.textContent = str;
    return measurer.getComputedTextLength();
  }
  function wrap(str, width, maxLines) {
    var words = String(str).split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      var next = cur ? cur + ' ' + w : w;
      if (measure(next) > width && cur) { lines.push(cur); cur = w; } else cur = next;
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] += '…';
    }
    return lines;
  }
  // Bar with a 4px rounded data end and a square baseline end.
  function barPath(x, y, w, h, end) {
    var rr = Math.min(4, Math.abs(end === 'right' || end === 'left' ? h : w) / 2, Math.abs(end === 'right' || end === 'left' ? w : h));
    if (rr <= 0.5) return 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
    switch (end) {
      case 'top': return 'M' + x + ',' + (y + h) + 'V' + (y + rr) + 'Q' + x + ',' + y + ' ' + (x + rr) + ',' + y + 'H' + (x + w - rr) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + rr) + 'V' + (y + h) + 'Z';
      case 'bottom': return 'M' + x + ',' + y + 'V' + (y + h - rr) + 'Q' + x + ',' + (y + h) + ' ' + (x + rr) + ',' + (y + h) + 'H' + (x + w - rr) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w) + ',' + (y + h - rr) + 'V' + y + 'Z';
      case 'right': return 'M' + x + ',' + y + 'H' + (x + w - rr) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + rr) + 'V' + (y + h - rr) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w - rr) + ',' + (y + h) + 'H' + x + 'Z';
      case 'left': return 'M' + (x + w) + ',' + y + 'H' + (x + rr) + 'Q' + x + ',' + y + ' ' + x + ',' + (y + rr) + 'V' + (y + h - rr) + 'Q' + x + ',' + (y + h) + ' ' + (x + rr) + ',' + (y + h) + 'H' + (x + w) + 'Z';
      default: return 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
    }
  }

  /* ---------- tooltip ---------- */
  function Tooltip(root) {
    var tip = html('div', 'chart-tip', root);
    tip.setAttribute('role', 'status');
    tip.hidden = true;
    return {
      show: function (px, py, title, rows) {
        tip.innerHTML = '';
        if (title) html('div', 'chart-tip-title', tip, title);
        rows.forEach(function (row) {
          var line = html('div', 'chart-tip-row', tip);
          if (row.color) {
            var sw = html('span', 'chart-swatch', line);
            sw.style.background = color(row.color);
          }
          html('span', 'chart-tip-key', line, row.key);
          html('span', 'chart-tip-val', line, row.value);
        });
        tip.hidden = false;
        var w = root.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
        var left = px + 14 + tw > w ? px - tw - 14 : px + 14;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = Math.max(0, py - th - 10) + 'px';
      },
      hide: function () { tip.hidden = true; }
    };
  }

  /* ---------- legend & table ---------- */
  function legend(root, items) {
    if (!items || items.length < 2) return;
    var box = html('div', 'chart-legend', root);
    items.forEach(function (it) {
      var item = html('span', 'chart-legend-item', box);
      var sw = html('span', 'chart-swatch chart-swatch-' + (it.shape || 'square'), item);
      sw.style.background = it.shape === 'wash' ? 'transparent' : color(it.color);
      if (it.dash) { sw.classList.add('chart-swatch-dash'); sw.style.borderTopColor = color(it.color); }
      if (it.shape === 'wash') sw.style.boxShadow = 'inset 0 0 0 20px ' + hexAlpha(color(it.color), 0.25);
      html('span', null, item, it.name);
    });
  }
  // Data tables are off by default; add a data-table attribute to a .chart to show one.
  function table(root, head, rows) {
    if (!root.hasAttribute('data-table')) return;
    var d = html('details', 'chart-data', root);
    html('summary', null, d, 'View data table');
    var wrapper = html('div', 'chart-data-scroll', d);
    var t = html('table', null, wrapper);
    var tr = html('tr', null, html('thead', null, t));
    head.forEach(function (h) { html('th', null, tr, h); });
    var tb = html('tbody', null, t);
    rows.forEach(function (row) {
      var r = html('tr', null, tb);
      row.forEach(function (c) { html('td', null, r, c); });
    });
  }
  function hexAlpha(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------- axes ---------- */
  function yAxisLeft(g, scale, tks, fmtKind, x0, x1) {
    tks.forEach(function (t) {
      var y = scale(t);
      el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: INK.grid, 'stroke-width': 1 }, g);
      text(g, x0 - 8, y + 4, tickFmt(fmtKind, t, tks.step), { 'text-anchor': 'end', class: 'tnum' });
    });
  }
  function xAxisBottom(g, scale, tks, fmtKind, y0, y1, grid) {
    tks.forEach(function (t) {
      var x = scale(t);
      if (grid) el('line', { x1: x, x2: x, y1: y0, y2: y1, stroke: INK.grid, 'stroke-width': 1 }, g);
      text(g, x, y1 + 18, tickFmt(fmtKind, t, tks.step), { 'text-anchor': 'middle', class: 'tnum' });
    });
  }
  function axisTitle(g, str, x, y, rotate) {
    if (!str) return;
    var t = text(g, x, y, str, { 'text-anchor': 'middle', fill: INK.secondary });
    if (rotate) t.setAttribute('transform', 'rotate(-90 ' + x + ' ' + y + ')');
  }
  function yTickWidth(tks, fmtKind) {
    return Math.max.apply(null, tks.map(function (t) { return measure(tickFmt(fmtKind, t, tks.step)); }));
  }
  function drawRules(g, rules, xs, ys, box) {
    (rules || []).forEach(function (rule) {
      var stroke = rule.muted ? INK.axis : INK.muted;
      if (rule.axis === 'x') {
        var x = xs(rule.value);
        if (x < box.l - 0.5 || x > box.r + 0.5) return;
        el('line', { x1: x, x2: x, y1: box.t, y2: box.b, stroke: stroke, 'stroke-width': 1 }, g);
        if (rule.label) {
          var right = x + measure(rule.label) + 6 < box.r;
          text(g, right ? x + 4 : x - 4, rule.above ? box.t - 6 : box.t + 11, rule.label, { 'text-anchor': right ? 'start' : 'end', fill: INK.secondary, 'font-size': 11, class: 'chart-halo' });
        }
      } else {
        var y = ys(rule.value);
        if (y < box.t - 0.5 || y > box.b + 0.5) return;
        el('line', { x1: box.l, x2: box.r, y1: y, y2: y, stroke: stroke, 'stroke-width': 1 }, g);
        if (rule.label) text(g, rule.align === 'left' ? box.l + 4 : box.r - 2, y - 5, rule.label, { 'text-anchor': rule.align === 'left' ? 'start' : 'end', fill: INK.secondary, 'font-size': 11, class: 'chart-halo' });
      }
    });
  }

  /* ---------- bar ---------- */
  function renderBar(root, spec, width) {
    var series = spec.series, cats = spec.categories, horizontal = spec.orient === 'h';
    var fmtKind = spec.y.format;
    var baseline = spec.baseline !== undefined ? spec.baseline : 0;
    var all = [baseline];
    if (spec.stacked) {
      cats.forEach(function (_, i) {
        all.push(series.reduce(function (s, se) { return s + Math.max(se.values[i] || 0, 0); }, 0));
        all.push(series.reduce(function (s, se) { return s + Math.min(se.values[i] || 0, 0); }, 0));
      });
    } else series.forEach(function (s) { s.values.forEach(function (v) { if (v !== null) all.push(v); }); });
    (spec.rules || []).forEach(function (r) { all.push(r.value); });
    // Pad only on the side(s) where bars extend away from the baseline.
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo || 1) * 0.06;
    var dom = [lo < baseline ? lo - pad : baseline, hi > baseline ? hi + pad : baseline];
    var nd = niceDomain(dom, 5);
    dom = [spec.y.min !== undefined ? spec.y.min : (lo < baseline ? nd[0] : baseline),
           spec.y.max !== undefined ? spec.y.max : (hi > baseline ? nd[1] : baseline)];
    // A truncated axis (min above zero) grows bars from its left/bottom edge.
    baseline = Math.min(Math.max(baseline, dom[0]), dom[1]);
    var multi = series.length > 1 && !spec.stacked;
    var legendItems = spec.legend || (series.length > 1 ? series.map(function (s) { return { name: s.name, color: s.color }; }) : null);
    legend(root, legendItems);
    var tip = Tooltip(root);
    var nBars = spec.stacked ? cats.length : cats.length * series.length;
    var showValues = !spec.stacked && nBars <= 16 && !spec.compact;
    var svg, g, box, vs;
    var valueLabelW = showValues ? Math.max.apply(null, all.map(function (v) { return measure(fmt(fmtKind, v)); })) + 8 : 0;

    if (horizontal) {
      var maxLabel = Math.min(width * 0.42, 230);
      var labelLines = cats.map(function (c) { return wrap(c, maxLabel, 2); });
      var labelW = Math.max.apply(null, labelLines.map(function (ls) { return Math.max.apply(null, ls.map(function (l) { return measure(l); })); }));
      var thick = spec.compact ? 10 : Math.min(24, multi ? 12 : 22);
      var groupH = multi ? thick * series.length + 2 * (series.length - 1) : thick;
      var rowH = Math.max(groupH + (spec.compact ? 6 : 14), labelLines.some(function (l) { return l.length > 1; }) ? 34 : 0);
      var ruleLabels = (spec.rules || []).some(function (r) { return r.label; });
      box = { l: labelW + 14, r: width - Math.max(valueLabelW, spec.stacked ? 44 : 12), t: ruleLabels ? 22 : 8 };
      box.b = box.t + rowH * cats.length;
      var height = box.b + 44;
      svg = el('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, role: 'img' });
      g = el('g', {}, svg);
      vs = linear(dom[0], dom[1], box.l, box.r);
      var tks = ticks(dom[0], dom[1], Math.max(2, Math.floor((box.r - box.l) / 80)));
      tks = keep(tks, dom);
      tks.step = tks.step || niceStep(dom[1] - dom[0], 4);
      xAxisBottom(g, vs, tks, fmtKind, box.t, box.b, true);
      axisTitle(g, spec.y.label, (box.l + box.r) / 2, box.b + 38);
      var hover = el('rect', { x: 0, y: 0, width: 0, height: 0, fill: '#f4f3ef', opacity: 0 }, g);
      hover.parentNode.insertBefore(hover, hover.parentNode.firstChild);
      var marks = el('g', {}, svg);
      cats.forEach(function (c, i) {
        var y0 = box.t + rowH * i + (rowH - groupH) / 2;
        labelLines[i].forEach(function (line, li) {
          text(g, box.l - 10, box.t + rowH * i + rowH / 2 + 4 + (li - (labelLines[i].length - 1) / 2) * 14, line,
            { 'text-anchor': 'end', fill: INK.primary });
        });
        // Positive segments stack rightward from the baseline, negative ones leftward.
        var posAcc = baseline, negAcc = baseline;
        var lastPos = -1, lastNeg = -1;
        series.forEach(function (s, si) { var v = s.values[i]; if (v > 0) lastPos = si; else if (v < 0) lastNeg = si; });
        series.forEach(function (s, si) {
          var v = s.values[i];
          if (v === null || v === undefined) return;
          var c0 = s.colors ? s.colors[i] : s.color;
          var yy = spec.stacked ? y0 : y0 + si * (thick + 2);
          var from = baseline, to = v;
          if (spec.stacked) {
            from = v >= 0 ? posAcc : negAcc;
            to = from + v;
            if (v >= 0) posAcc = to; else negAcc = to;
          }
          var xa = vs(Math.min(from, to)), xb = vs(Math.max(from, to));
          var gap = spec.stacked && from !== baseline ? 2 : 0;
          var isEnd = !spec.stacked || si === (v >= 0 ? lastPos : lastNeg);
          var gx = to >= from ? xa + gap : xa;
          el('path', { d: barPath(gx, yy, Math.max(xb - xa - gap, 1), thick, isEnd ? (to >= from ? 'right' : 'left') : null), fill: color(c0) }, marks);
          if (spec.stacked) {
            var seg = fmt(fmtKind, v);
            if (measure(seg) + 12 < xb - xa - gap) text(marks, (xa + xb + gap) / 2, yy + thick / 2 + 4, seg, { 'text-anchor': 'middle', fill: '#fff', 'font-weight': 600 });
          }
          if (showValues) {
            var pos = to >= from, lab = fmt(fmtKind, v), lw = measure(lab);
            if (!pos && xa - 6 - lw < box.l) {
              // No room left of the bar: put the value inside it, or past the baseline.
              if (xb - xa > lw + 12) text(marks, xa + 6, yy + thick / 2 + 4, lab, { fill: '#fff', 'font-weight': 600, class: 'tnum' });
              else text(marks, xb + 6, yy + thick / 2 + 4, lab, { fill: INK.secondary, class: 'tnum' });
            } else {
              text(marks, pos ? xb + 6 : xa - 6, yy + thick / 2 + 4, lab, { 'text-anchor': pos ? 'start' : 'end', fill: INK.secondary, class: 'tnum' });
            }
          }
        });
        if (spec.stacked) {
          var total = fmt(fmtKind, posAcc + negAcc - baseline);
          text(marks, vs(posAcc) + 6, y0 + thick / 2 + 4, total, { fill: INK.primary, 'font-weight': 600, class: 'tnum' });
        }
      });
      el('line', { x1: vs(baseline), x2: vs(baseline), y1: box.t, y2: box.b, stroke: INK.axis, 'stroke-width': 1 }, marks);
      drawRules(marks, (spec.rules || []).map(function (r) { return { axis: 'x', value: r.value, label: r.label, above: true }; }), vs, null, box);
      var hit = el('rect', { x: 0, y: box.t, width: width, height: box.b - box.t, fill: 'transparent' }, svg);
      hit.addEventListener('mousemove', function (e) {
        var rect = svg.getBoundingClientRect();
        var i = Math.floor((e.clientY - rect.top - box.t) / rowH);
        if (i < 0 || i >= cats.length) return tip.hide();
        hover.setAttribute('x', 0); hover.setAttribute('width', width);
        hover.setAttribute('y', box.t + rowH * i); hover.setAttribute('height', rowH); hover.setAttribute('opacity', 1);
        tip.show(e.clientX - rect.left, e.clientY - rect.top, cats[i], barTipRows(series, i, fmtKind));
      });
      hit.addEventListener('mouseleave', function () { tip.hide(); hover.setAttribute('opacity', 0); });
    } else {
      var height2 = spec.height || 300;
      var vt = keep(ticks(dom[0], dom[1], 5), dom);
      vt.step = vt.step || niceStep(dom[1] - dom[0], 5);
      var tw = yTickWidth(vt, fmtKind);
      box = { l: tw + 30, r: width - 4, t: showValues ? 18 : 10, b: height2 - 46 };
      svg = el('svg', { width: width, height: height2, viewBox: '0 0 ' + width + ' ' + height2, role: 'img' });
      g = el('g', {}, svg);
      vs = linear(dom[0], dom[1], box.b, box.t);
      var hoverV = el('rect', { x: 0, y: box.t, width: 0, height: box.b - box.t, fill: '#f4f3ef', opacity: 0 }, g);
      yAxisLeft(g, vs, vt, fmtKind, box.l, box.r);
      axisTitle(g, spec.y.label, 11, (box.t + box.b) / 2, true);
      var band = (box.r - box.l) / cats.length;
      var thickV = Math.min(24, (band * 0.7 - 2 * (series.length - 1)) / (spec.stacked ? 1 : series.length));
      var gw = spec.stacked ? thickV : thickV * series.length + 2 * (series.length - 1);
      var marksV = el('g', {}, svg);
      cats.forEach(function (c, i) {
        var cx = box.l + band * (i + 0.5);
        var lines = wrap(c, band - 6, 2);
        lines.forEach(function (line, li) { text(g, cx, box.b + 18 + li * 13, line, { 'text-anchor': 'middle', fill: INK.primary }); });
        var acc = baseline;
        series.forEach(function (s, si) {
          var v = s.values[i];
          if (v === null || v === undefined) return;
          var c0 = s.colors ? s.colors[i] : s.color;
          var x = spec.stacked ? cx - thickV / 2 : cx - gw / 2 + si * (thickV + 2);
          var from = spec.stacked ? acc : baseline, to = spec.stacked ? acc + v : v;
          var ya = vs(Math.max(from, to)), yb = vs(Math.min(from, to));
          el('path', { d: barPath(x, ya, thickV, Math.max(yb - ya, 1), to >= from ? 'top' : 'bottom'), fill: color(c0) }, marksV);
          if (showValues && thickV >= 14) {
            var label = fmt(fmtKind, v);
            if (measure(label, 11) <= thickV + 10) text(marksV, x + thickV / 2, to >= from ? ya - 5 : yb + 13, label, { 'text-anchor': 'middle', fill: INK.secondary, 'font-size': 11, class: 'tnum' });
          }
          acc = to;
        });
      });
      el('line', { x1: box.l, x2: box.r, y1: vs(baseline), y2: vs(baseline), stroke: INK.axis, 'stroke-width': 1 }, marksV);
      drawRules(marksV, (spec.rules || []).map(function (r) { return { axis: 'y', value: r.value, label: r.label, align: 'left' }; }), null, vs, box);
      var hitV = el('rect', { x: box.l, y: box.t, width: box.r - box.l, height: box.b - box.t + 30, fill: 'transparent' }, svg);
      hitV.addEventListener('mousemove', function (e) {
        var rect = svg.getBoundingClientRect();
        var i = Math.floor((e.clientX - rect.left - box.l) / band);
        if (i < 0 || i >= cats.length) return tip.hide();
        hoverV.setAttribute('x', box.l + band * i); hoverV.setAttribute('width', band); hoverV.setAttribute('opacity', 1);
        tip.show(e.clientX - rect.left, e.clientY - rect.top, cats[i], barTipRows(series, i, fmtKind));
      });
      hitV.addEventListener('mouseleave', function () { tip.hide(); hoverV.setAttribute('opacity', 0); });
    }
    root.insertBefore(svg, root.querySelector('.chart-tip'));
    table(root, [''].concat(series.map(function (s) { return s.name; })), cats.map(function (c, i) {
      return [c].concat(series.map(function (s) { return fmt(fmtKind, s.values[i]); }));
    }));
  }
  function barTipRows(series, i, fmtKind) {
    var rows = [];
    series.forEach(function (s) {
      if (s.values[i] === null || s.values[i] === undefined) return;
      rows.push({ key: s.name, value: fmt(fmtKind, s.values[i]), color: s.colors ? s.colors[i] : s.color });
      (s.tips && s.tips[i] || []).forEach(function (t) { rows.push({ key: t[0], value: t[1] }); });
    });
    return rows;
  }

  /* ---------- line (incl. histogram bins) ---------- */
  function renderLine(root, spec, width) {
    var series = spec.series;
    var xs_ = [], ys_ = [];
    series.forEach(function (s) {
      (s.points || []).forEach(function (p) { xs_.push(p[0]); ys_.push(p[1]); });
      (s.bins || []).forEach(function (b) { xs_.push(b[0], b[1]); ys_.push(b[2], 0); });
    });
    (spec.rules || []).forEach(function (r) { (r.axis === 'x' ? xs_ : ys_).push(r.value); });
    var xd = extent(xs_, spec.x, 0, false), yd = extent(ys_, spec.y, 0.08, false);
    if (spec.y.max === undefined) yd[1] = niceDomain(yd, 5)[1];
    if (spec.y.min === undefined) yd[0] = niceDomain(yd, 5)[0];
    var height = spec.height || 300;
    if (spec.square) height = Math.min(height, width * 0.85);
    var yt = keep(ticks(yd[0], yd[1], 5), yd);
    yt.step = yt.step || niceStep(yd[1] - yd[0], 5);
    var box = { l: yTickWidth(yt, spec.y.format) + 30, r: width - 10, t: 12, b: height - 46 };
    if (spec.square) box.r = Math.min(box.r, box.l + (box.b - box.t) * 1.15);
    var xs = linear(xd[0], xd[1], box.l, box.r), ys = linear(yd[0], yd[1], box.b, box.t);
    var legendItems = series.map(function (s) {
      return { name: s.name, color: s.color, shape: s.kind === 'bins' ? 'square' : 'line', dash: s.dash };
    });
    (spec.bands || []).forEach(function (b) {
      ['below', 'above'].forEach(function (k) { if (b[k] && b[k].label) legendItems.push({ name: b[k].label, color: b[k].color, shape: 'wash' }); });
    });
    legend(root, legendItems);
    var tip = Tooltip(root);
    var svg = el('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, role: 'img' });
    var g = el('g', {}, svg);
    yAxisLeft(g, ys, yt, spec.y.format, box.l, box.r);
    var xt = spec.x.ticks || ticks(xd[0], xd[1], Math.max(3, Math.floor((box.r - box.l) / 70)));
    xt = keep(xt, xd);
    xt.step = xt.step || niceStep(xd[1] - xd[0], 5);
    xAxisBottom(g, xs, xt, spec.x.format, box.t, box.b, false);
    el('line', { x1: box.l, x2: box.r, y1: box.b, y2: box.b, stroke: INK.axis }, g);
    axisTitle(g, spec.x.label, (box.l + box.r) / 2, box.b + 38);
    axisTitle(g, spec.y.label, 11, (box.t + box.b) / 2, true);
    var clipId = 'clip' + Math.random().toString(36).slice(2);
    var defs = el('defs', {}, svg);
    var cp = el('clipPath', { id: clipId }, defs);
    el('rect', { x: box.l - 6, y: box.t - 6, width: box.r - box.l + 12, height: box.b - box.t + 12 }, cp);
    var marks = el('g', { 'clip-path': 'url(#' + clipId + ')' }, svg);

    (spec.bands || []).forEach(function (b) {
      var pts = series[b.series].points;
      var area = 'M' + pts.map(function (p) { return xs(p[0]) + ',' + ys(p[1]); }).join('L') +
        'L' + xs(pts[pts.length - 1][0]) + ',' + ys(b.ref) + 'L' + xs(pts[0][0]) + ',' + ys(b.ref) + 'Z';
      [['above', box.t - 6, ys(b.ref) - box.t + 6], ['below', ys(b.ref), box.b - ys(b.ref)]].forEach(function (part) {
        if (!b[part[0]]) return;
        var id = clipId + part[0];
        el('rect', { x: box.l, y: part[1], width: box.r - box.l, height: Math.max(part[2], 0) }, el('clipPath', { id: id }, defs));
        el('path', { d: area, fill: hexAlpha(color(b[part[0]].color), 0.16), 'clip-path': 'url(#' + id + ')' }, marks);
      });
    });
    series.forEach(function (s) {
      if (s.kind !== 'bins') return;
      s.bins.forEach(function (b) {
        var x0 = xs(b[0]) + 1, x1 = xs(b[1]) - 1, y = ys(b[2]);
        if (x1 - x0 < 1 || b[2] <= 0) return;
        el('path', { d: barPath(x0, y, x1 - x0, ys(0) - y, 'top'), fill: color(s.color), opacity: series.length > 1 ? 0.55 : 1 }, marks);
      });
    });
    drawRules(marks, spec.rules, xs, ys, box);
    series.forEach(function (s) {
      if (s.kind === 'bins') return;
      var d = s.points.map(function (p, i) {
        var cmd = (i ? 'L' : 'M') + xs(p[0]) + ',' + ys(p[1]);
        if (s.step && i) cmd = 'H' + xs(p[0]) + 'V' + ys(p[1]);
        return cmd;
      }).join('');
      el('path', { d: d, fill: 'none', stroke: color(s.color), 'stroke-width': s.dash ? 1.5 : 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dash ? '5 4' : null }, marks);
      if (spec.markers && !s.dash) s.points.forEach(function (p) {
        el('circle', { cx: xs(p[0]), cy: ys(p[1]), r: 4, fill: color(s.color), stroke: INK.surface, 'stroke-width': 2 }, marks);
      });
    });
    var cross = el('line', { y1: box.t, y2: box.b, stroke: INK.muted, 'stroke-width': 1, opacity: 0 }, svg);
    var dots = el('g', {}, svg);
    var hit = el('rect', { x: box.l, y: box.t, width: box.r - box.l, height: box.b - box.t, fill: 'transparent' }, svg);
    var tipSeries = series.filter(function (s) { return !s.dash || series.length === 1; });
    hit.addEventListener('mousemove', function (e) {
      var rect = svg.getBoundingClientRect();
      var px = e.clientX - rect.left;
      var xv = xd[0] + (px - box.l) / (box.r - box.l) * (xd[1] - xd[0]);
      var rows = [], snapX = null;
      dots.innerHTML = '';
      tipSeries.forEach(function (s) {
        if (s.kind === 'bins') {
          var b = s.bins.filter(function (b) { return xv >= b[0] && xv < b[1]; })[0];
          if (b) rows.push({ key: s.name, value: fmt(spec.x.format, b[0]) + '–' + fmt(spec.x.format, b[1]) + ': ' + (b[3] !== undefined ? b[3].toLocaleString() : fmt(spec.y.format, b[2])), color: s.color });
          return;
        }
        var best = null;
        s.points.forEach(function (p) { if (!best || Math.abs(p[0] - xv) < Math.abs(best[0] - xv)) best = p; });
        if (!best) return;
        if (snapX === null) snapX = best[0];
        rows.push({ key: s.name, value: fmt(spec.y.format, best[1]), color: s.color });
        el('circle', { cx: xs(best[0]), cy: ys(best[1]), r: 5, fill: color(s.color), stroke: INK.surface, 'stroke-width': 2 }, dots);
      });
      if (!rows.length) return tip.hide();
      var cx = snapX !== null ? xs(snapX) : px;
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('opacity', 1);
      var title = (spec.x.label || '').split('(')[0].trim() + ': ' + fmt(spec.x.format === 'int' ? 'dec1' : spec.x.format, snapX !== null ? snapX : xv);
      tip.show(px, e.clientY - rect.top, title, rows);
    });
    hit.addEventListener('mouseleave', function () { tip.hide(); cross.setAttribute('opacity', 0); dots.innerHTML = ''; });
    root.insertBefore(svg, root.querySelector('.chart-tip'));
    var head = [spec.x.label || 'x'], rowsT = [];
    series.forEach(function (s) {
      if (s.kind === 'bins') s.bins.forEach(function (b) { rowsT.push([s.name, fmt(spec.x.format, b[0]) + '–' + fmt(spec.x.format, b[1]), fmt(spec.y.format, b[2])]); });
      else s.points.forEach(function (p) { rowsT.push([s.name, fmt(spec.x.format === 'int' ? 'dec1' : spec.x.format, p[0]), fmt(spec.y.format, p[1])]); });
    });
    table(root, ['Series'].concat(head, [spec.y.label || 'y']), rowsT);
  }

  /* ---------- scatter ---------- */
  function renderScatter(root, spec, width) {
    var groups = spec.groups;
    var xv = [], yv = [];
    groups.forEach(function (gr) { gr.points.forEach(function (p) { xv.push(p.x); yv.push(p.y); }); });
    var xd = niceDomain(extent(xv, spec.x, 0.06, false), 5), yd = niceDomain(extent(yv, spec.y, 0.08, false), 5);
    if (spec.x.min !== undefined) xd[0] = spec.x.min;
    if (spec.x.max !== undefined) xd[1] = spec.x.max;
    if (spec.y.min !== undefined) yd[0] = spec.y.min;
    if (spec.y.max !== undefined) yd[1] = spec.y.max;
    var height = spec.height || 360;
    if (spec.square) height = Math.min(height, width);
    var yt = keep(ticks(yd[0], yd[1], 5), yd);
    yt.step = yt.step || niceStep(yd[1] - yd[0], 5);
    var box = { l: yTickWidth(yt, spec.y.format) + 30, r: width - 10, t: 12, b: height - 46 };
    var xs = linear(xd[0], xd[1], box.l, box.r);
    var ys = spec.y.reverse ? linear(yd[0], yd[1], box.t, box.b) : linear(yd[0], yd[1], box.b, box.t);
    var legendItems = groups.map(function (gr) { return { name: gr.name, color: gr.color, shape: 'dot' }; });
    if (spec.trend) legendItems.push({ name: spec.trend.label || 'Trend', color: 'ink', shape: 'line' });
    legend(root, legendItems);
    var tip = Tooltip(root);
    var svg = el('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, role: 'img' });
    var g = el('g', {}, svg);
    yAxisLeft(g, ys, yt, spec.y.format, box.l, box.r);
    var xt = keep(ticks(xd[0], xd[1], Math.max(3, Math.floor((box.r - box.l) / 70))), xd);
    xt.step = xt.step || niceStep(xd[1] - xd[0], 5);
    xAxisBottom(g, xs, xt, spec.x.format, box.t, box.b, true);
    el('line', { x1: box.l, x2: box.r, y1: box.b, y2: box.b, stroke: INK.axis }, g);
    axisTitle(g, spec.x.label, (box.l + box.r) / 2, box.b + 38);
    axisTitle(g, spec.y.label, 11, (box.t + box.b) / 2, true);
    if (spec.quadrants) {
      var q = spec.quadrants, qa = { fill: INK.muted, 'font-size': 11, 'font-style': 'italic' };
      if (q.tl) text(g, box.l + 8, box.t + 14, q.tl, qa);
      if (q.tr) text(g, box.r - 8, box.t + 14, q.tr, Object.assign({ 'text-anchor': 'end' }, qa));
      if (q.bl) text(g, box.l + 8, box.b - 8, q.bl, qa);
      if (q.br) text(g, box.r - 8, box.b - 8, q.br, Object.assign({ 'text-anchor': 'end' }, qa));
    }
    drawRules(g, spec.rules, xs, ys, box);
    if (spec.trend) {
      var t0 = spec.trend, xa = xd[0], xb = xd[1];
      var tid = 'trend' + Math.random().toString(36).slice(2);
      el('rect', { x: box.l, y: box.t, width: box.r - box.l, height: box.b - box.t }, el('clipPath', { id: tid }, el('defs', {}, svg)));
      el('line', { x1: xs(xa), y1: ys(t0.slope * xa + t0.intercept), x2: xs(xb), y2: ys(t0.slope * xb + t0.intercept), stroke: COLORS.ink, 'stroke-width': 1.5, 'clip-path': 'url(#' + tid + ')' }, g);
    }
    var marks = el('g', {}, svg);
    var all = [];
    groups.forEach(function (gr) {
      gr.points.forEach(function (p) {
        var cx = xs(p.x), cy = ys(p.y);
        el('circle', { cx: cx, cy: cy, r: gr.r || 5, fill: color(gr.color), stroke: INK.surface, 'stroke-width': 1.5 }, marks);
        all.push({ p: p, gr: gr, cx: cx, cy: cy });
      });
    });
    // Selective direct labels with simple collision avoidance.
    var placed = all.map(function (a) { return { x0: a.cx - 5, x1: a.cx + 5, y0: a.cy - 5, y1: a.cy + 5 }; });
    var labelLayer = el('g', {}, svg);
    var toLabel = all.filter(function (a) { return a.p.label && (a.gr.labelAll || (a.gr.labels || []).indexOf(a.p.label) >= 0); });
    toLabel.sort(function (a, b) { return (b.gr.color === 'gray') - (a.gr.color === 'gray'); }).reverse();
    toLabel.forEach(function (a) {
      var w = measure(a.p.label, 11), h = 12, rad = (a.gr.r || 5) + 3;
      var options = [[a.cx + rad, a.cy + 4, 'start'], [a.cx - rad, a.cy + 4, 'end'], [a.cx, a.cy - rad - 2, 'middle'], [a.cx, a.cy + rad + 10, 'middle']];
      for (var i = 0; i < options.length; i++) {
        var o = options[i];
        var x0 = o[2] === 'start' ? o[0] : o[2] === 'end' ? o[0] - w : o[0] - w / 2;
        var bb = { x0: x0, x1: x0 + w, y0: o[1] - h + 2, y1: o[1] + 2 };
        if (bb.x0 < box.l || bb.x1 > box.r || bb.y0 < box.t || bb.y1 > box.b) continue;
        var hits = placed.some(function (p) { return !(bb.x1 < p.x0 || bb.x0 > p.x1 || bb.y1 < p.y0 || bb.y0 > p.y1); });
        if (hits) continue;
        placed.push(bb);
        text(labelLayer, o[0], o[1], a.p.label, { 'text-anchor': o[2], 'font-size': 11, fill: a.gr.color === 'gray' ? INK.muted : INK.primary, 'font-weight': a.gr.color === 'gray' ? 400 : 600, class: 'chart-halo' });
        break;
      }
    });
    var ring = el('circle', { r: 7, fill: 'none', stroke: INK.primary, 'stroke-width': 1.5, opacity: 0 }, svg);
    var hit = el('rect', { x: box.l, y: box.t, width: box.r - box.l, height: box.b - box.t, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', function (e) {
      var rect = svg.getBoundingClientRect();
      var px = e.clientX - rect.left, py = e.clientY - rect.top, best = null, bd = 24 * 24;
      all.forEach(function (a) {
        var d = (a.cx - px) * (a.cx - px) + (a.cy - py) * (a.cy - py);
        if (d < bd || (d === bd && a.gr.color !== 'gray')) { bd = d; best = a; }
      });
      if (!best) { ring.setAttribute('opacity', 0); return tip.hide(); }
      ring.setAttribute('cx', best.cx); ring.setAttribute('cy', best.cy); ring.setAttribute('opacity', 1);
      ring.setAttribute('r', (best.gr.r || 5) + 3);
      var rows = best.p.tip ? best.p.tip.map(function (t) { return { key: t[0], value: t[1] }; }) :
        [{ key: spec.x.label, value: fmt(spec.x.format, best.p.x) }, { key: spec.y.label, value: fmt(spec.y.format, best.p.y) }];
      var title = best.p.tip && best.p.label && !/ /.test(best.p.tip[0][1]) ? best.p.label : (best.p.label || best.gr.name);
      if (best.p.tip && best.p.tip[0][0] === 'Player') title = null;
      if (best.p.tip && best.p.tip[0][0] === 'Game') title = null;
      if (best.p.tip && best.p.tip[0][0] === 'Team') title = null;
      tip.show(best.cx, best.cy, title, rows);
    });
    hit.addEventListener('mouseleave', function () { tip.hide(); ring.setAttribute('opacity', 0); });
    root.insertBefore(svg, root.querySelector('.chart-tip'));
    table(root, ['Point', 'Group', spec.x.label, spec.y.label], all.map(function (a) {
      var name = a.p.label || (a.p.tip ? a.p.tip[0][1] : '');
      return [name, a.gr.name, fmt(spec.x.format, a.p.x), fmt(spec.y.format, a.p.y)];
    }));
  }

  /* ---------- heatmap ---------- */
  function lerpColor(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var c = [16, 8, 0].map(function (s) { var p = (x >> s) & 255, q = (y >> s) & 255; return Math.round(p + (q - p) * t); });
    return '#' + ((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1);
  }
  function ramp(stops, t) {
    t = Math.max(0, Math.min(1, t));
    var i = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
    return lerpColor(stops[i], stops[i + 1], t * (stops.length - 1) - i);
  }
  function heatColor(sc, v) {
    if (sc.type === 'div') {
      if (v < sc.mid) return ramp(DIV_LOW.concat([DIV_MID]), (v - sc.min) / (sc.mid - sc.min));
      return ramp([DIV_MID].concat(DIV_HIGH), (v - sc.mid) / (sc.max - sc.mid));
    }
    return ramp(SEQ, (v - sc.min) / (sc.max - sc.min));
  }
  function luminance(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255].map(function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); })
      .reduce(function (s, c, i) { return s + c * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function renderHeatmap(root, spec, width) {
    var xc = spec.x.categories, yc = spec.y.categories, sc = spec.scale;
    var tip = Tooltip(root);
    var labelW = Math.max.apply(null, yc.map(function (c) { return measure(c); })) + 40;
    var cellW = Math.min(110, (width - labelW - 4) / xc.length), cellH = 40;
    var box = { l: labelW, t: 22, r: labelW + cellW * xc.length };
    box.b = box.t + cellH * yc.length;
    var height = box.b + 78;
    var svg = el('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, role: 'img' });
    text(svg, (box.l + box.r) / 2, 12, spec.x.label, { 'text-anchor': 'middle', fill: INK.secondary });
    var yl = text(svg, 11, (box.t + box.b) / 2, spec.y.label, { 'text-anchor': 'middle', fill: INK.secondary });
    yl.setAttribute('transform', 'rotate(-90 11 ' + (box.t + box.b) / 2 + ')');
    xc.forEach(function (c, j) { text(svg, box.l + cellW * (j + 0.5), box.b + 16, c, { 'text-anchor': 'middle', fill: INK.primary }); });
    yc.forEach(function (c, i) {
      text(svg, box.l - 8, box.t + cellH * (i + 0.5) + 4, c, { 'text-anchor': 'end', fill: INK.primary });
      xc.forEach(function (_, j) {
        var v = spec.values[i][j], x = box.l + cellW * j + 1, y = box.t + cellH * i + 1;
        var fill = v === null ? '#f7f7f5' : heatColor(sc, v);
        var cell = el('rect', { x: x, y: y, width: cellW - 2, height: cellH - 2, rx: 3, fill: fill }, svg);
        var label = v === null ? '—' : fmt(spec.format, v);
        text(svg, x + (cellW - 2) / 2, y + cellH / 2 + 3, label, {
          'text-anchor': 'middle', 'font-weight': 600, class: 'tnum',
          fill: v === null ? INK.muted : luminance(fill) > 0.35 ? INK.primary : '#ffffff'
        });
        cell.addEventListener('mousemove', function (e) {
          var rect = svg.getBoundingClientRect();
          var rows = [{ key: 'Value', value: v === null ? 'Too few plays' : fmt(spec.format, v) }];
          if (spec.counts) rows.push({ key: 'Plays', value: spec.counts[i][j].toLocaleString() });
          tip.show(e.clientX - rect.left, e.clientY - rect.top, yc[i] + ' & ' + xc[j], rows);
        });
        cell.addEventListener('mouseleave', function () { tip.hide(); });
      });
    });
    // Scale legend
    var lw = Math.min(220, box.r - box.l), lx = box.l, ly = box.b + 34;
    var gid = 'grad' + Math.random().toString(36).slice(2);
    var grad = el('linearGradient', { id: gid }, el('defs', {}, svg));
    for (var k = 0; k <= 10; k++) el('stop', { offset: k * 10 + '%', 'stop-color': heatColor(sc, sc.min + (sc.max - sc.min) * k / 10) }, grad);
    el('rect', { x: lx, y: ly, width: lw, height: 8, rx: 2, fill: 'url(#' + gid + ')' }, svg);
    text(svg, lx, ly + 22, fmt(spec.format, sc.min), { class: 'tnum' });
    text(svg, lx + lw, ly + 22, fmt(spec.format, sc.max), { 'text-anchor': 'end', class: 'tnum' });
    if (sc.mid !== undefined) text(svg, lx + lw * (sc.mid - sc.min) / (sc.max - sc.min), ly + 22, fmt(spec.format, sc.mid), { 'text-anchor': 'middle', class: 'tnum' });
    root.insertBefore(svg, root.querySelector('.chart-tip'));
    table(root, [spec.y.label + ' \\ ' + spec.x.label].concat(xc), yc.map(function (c, i) {
      return [c].concat(spec.values[i].map(function (v, j) {
        return fmt(spec.format, v) + (spec.counts ? ' (' + spec.counts[i][j].toLocaleString() + ')' : '');
      }));
    }));
  }

  /* ---------- wiring ---------- */
  var RENDER = { bar: renderBar, line: renderLine, scatter: renderScatter, heatmap: renderHeatmap };

  function draw(node, spec) {
    var width = Math.floor(node.clientWidth);
    if (!width || width === node._w) return;
    node._w = width;
    node.innerHTML = '';
    RENDER[spec.type](node, spec, width);
  }

  function init() {
    var src = document.body.getAttribute('data-charts');
    var nodes = [].slice.call(document.querySelectorAll('.chart[data-chart]'));
    if (!src || !nodes.length) return;
    fetch(src).then(function (r) { return r.json(); }).then(function (data) {
      window.BLOG_DATA = data;
      nodes.forEach(function (node) {
        var spec = data.charts[node.getAttribute('data-chart')];
        if (!spec) { node.textContent = 'Chart unavailable.'; return; }
        draw(node, spec);
        if (window.ResizeObserver) {
          var timer;
          new ResizeObserver(function () { clearTimeout(timer); timer = setTimeout(function () { draw(node, spec); }, 120); }).observe(node);
        }
      });
    }).catch(function () {
      nodes.forEach(function (n) { n.textContent = 'Chart data failed to load.'; });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
