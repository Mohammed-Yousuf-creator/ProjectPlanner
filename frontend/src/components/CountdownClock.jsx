import { useEffect, useState } from 'react';

export default function CountdownClock({ target, label = '', overdueMessage }) {
  const [left, setLeft] = useState(target ? new Date(target).getTime() - Date.now() : 0);

  useEffect(() => {
    const t = setInterval(() => {
      setLeft(new Date(target).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, [target]);

  const overdue = left < 0;
  const total = Math.max(0, Math.floor(left / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (overdue) {
    return (
      <div className="countdown overdue" title={overdueMessage || 'Deadline passed'}>
        <span className="val">00</span><span className="lab">d</span>
        <span className="val">00</span><span className="lab">h</span>
        <span className="val">00</span><span className="lab">m</span>
        <span className="val">00</span><span className="lab">s</span>
        <span style={{ color: '#f87171', fontSize: '0.85rem', fontWeight: 700, marginLeft: "0.5rem" }}>{overdueMessage || 'OVERDUE'}</span>
      </div>
    );
  }

  return (
    <div className="countdown" title={label || ''}>
      <div className="unit"><span className="val">{days}</span><span className="lab">d</span></div>
      <div className="unit"><span className="val">{hours}</span><span className="lab">h</span></div>
      <div className="unit"><span className="val">{minutes}</span><span className="lab">m</span></div>
      <div className="unit"><span className="val">{seconds}</span><span className="lab">s</span></div>
      {label && <span style={{ color: '#94a3b8', fontSize: '0.8rem', marginLeft: "0.5rem" }}>{label}</span>}
    </div>
  );
}
