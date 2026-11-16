import { useEffect, useRef, useState } from 'react';
import { Icon, Modal, Segmented } from './ui';

// A deliberately crude drawing surface: pen, boxes, arrows and labels. Enough for the world's
// ugliest wireframe, which is exactly the point.

type Tool = 'pen' | 'box' | 'arrow' | 'text';

type Shape =
  | { kind: 'pen'; points: [number, number][] }
  | { kind: 'box' | 'arrow'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'text'; x: number; y: number; text: string };

const W = 960;
const H = 600;
const INK = '#1c1f24';

function draw(ctx: CanvasRenderingContext2D, shapes: Shape[]) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.font = '18px system-ui, sans-serif';
  for (const s of shapes) {
    if (s.kind === 'pen') {
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.points.length === 1) ctx.lineTo(s.points[0][0] + 0.1, s.points[0][1]);
      ctx.stroke();
    } else if (s.kind === 'box') {
      ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
    } else if (s.kind === 'arrow') {
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - 14 * Math.cos(angle - 0.45), s.y2 - 14 * Math.sin(angle - 0.45));
      ctx.lineTo(s.x2 - 14 * Math.cos(angle + 0.45), s.y2 - 14 * Math.sin(angle + 0.45));
      ctx.closePath();
      ctx.fill();
    } else if (s.kind === 'text') {
      ctx.fillText(s.text, s.x, s.y);
    }
  }
}

export function SketchPad({ onClose, onSave, busy }: { onClose: () => void; onSave: (png: Blob) => void | Promise<void>; busy: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('box');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [current, setCurrent] = useState<Shape | null>(null);
  const [label, setLabel] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) draw(ctx, current ? [...shapes, current] : shapes);
  }, [shapes, current]);

  const point = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };

  const commitLabel = () => {
    if (label && label.text.trim()) setShapes((s) => [...s, { kind: 'text', x: label.x, y: label.y, text: label.text.trim() }]);
    setLabel(null);
  };

  const down = (e: React.PointerEvent) => {
    const [x, y] = point(e);
    if (tool === 'text') {
      commitLabel();
      setLabel({ x, y, text: '' });
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    setCurrent(tool === 'pen' ? { kind: 'pen', points: [[x, y]] } : { kind: tool, x1: x, y1: y, x2: x, y2: y });
  };
  const move = (e: React.PointerEvent) => {
    if (!current) return;
    const [x, y] = point(e);
    if (current.kind === 'pen') setCurrent({ kind: 'pen', points: [...current.points, [x, y]] });
    else if (current.kind !== 'text') setCurrent({ ...current, x2: x, y2: y });
  };
  const up = () => {
    if (!current) return;
    const tiny = current.kind !== 'pen' && current.kind !== 'text' && Math.abs(current.x2 - current.x1) < 4 && Math.abs(current.y2 - current.y1) < 4;
    if (!tiny) setShapes((s) => [...s, current]);
    setCurrent(null);
  };

  const save = () => {
    const all = label && label.text.trim() ? [...shapes, { kind: 'text' as const, x: label.x, y: label.y, text: label.text.trim() }] : shapes;
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    draw(ctx, all);
    canvas.current!.toBlob((blob) => { if (blob) void onSave(blob); }, 'image/png');
  };

  const empty = shapes.length === 0 && !(label && label.text.trim());

  return (
    <Modal title="Sketch pad" onClose={onClose} wide
      footer={<>
        <span className="muted grow">Boxes for screens, arrows for “what happens next”. Ugly is fine.</span>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={empty || busy}>{busy ? 'Saving…' : 'Save sketch'}</button>
      </>}>
      <div className="sketch-tools">
        <Segmented<Tool> ariaLabel="Tool" value={tool} onChange={(t) => { commitLabel(); setTool(t); }}
          options={[{ value: 'box', label: 'Box' }, { value: 'arrow', label: 'Arrow' }, { value: 'pen', label: 'Pen' }, { value: 'text', label: 'Label' }]} />
        <button className="btn btn-sm" onClick={() => { setLabel(null); setShapes((s) => s.slice(0, -1)); }} disabled={shapes.length === 0}><Icon name="undo" size={14} /> Undo</button>
        <button className="btn btn-sm" onClick={() => { setLabel(null); setShapes([]); }} disabled={shapes.length === 0}>Clear</button>
      </div>
      <div className="sketch-surface">
        <canvas ref={canvas} width={W} height={H} className={`sketch-canvas tool-${tool}`}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          // Keep the focus in the label field that the same click has just opened.
          onMouseDown={(e) => { if (tool === 'text') e.preventDefault(); }}
          aria-label="Drawing area" />
        {label && (
          <input className="sketch-label" autoFocus value={label.text} placeholder="Label"
            style={{ left: `${(label.x / W) * 100}%`, top: `${(label.y / H) * 100}%` }}
            onChange={(e) => setLabel({ ...label, text: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { e.stopPropagation(); setLabel(null); } }}
            onBlur={commitLabel} />
        )}
      </div>
    </Modal>
  );
}
