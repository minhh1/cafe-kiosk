export const formatTime = (v: any) => {
  if (typeof v === 'number') return new Date(v * 1000).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return v;
};

export default function TimeDisplay({ s, logs, onEdit, isCompact = false }: any) {
  const logsForShift = Array.isArray(logs) ? logs.filter((l: any) => l.shift_id.toString() === s.Id.toString()) : [];
  const sEdit = logsForShift.find((l: any) => l.action_type === 'EDIT_START');
  const eEdit = logsForShift.find((l: any) => l.action_type === 'EDIT_END');
  const oS = formatTime(s.StartTime); const oE = formatTime(s.EndTime);

  return (
    <div className={`${isCompact ? 'text-[9px] print:text-[7pt]' : 'text-lg'} font-bold flex flex-wrap items-center gap-1 print:text-black`}>
      <button onClick={(e) => { e.stopPropagation(); onEdit(s.Id, 'EDIT_START'); }} className="hover:underline">
        {sEdit && sEdit.override_start !== oS ? <><span className="line-through text-slate-300 print:text-slate-400">{oS}</span> <span className="text-blue-600 print:text-black">({sEdit.override_start})</span></> : <span className="text-orange-600 print:text-black">{oS}</span>}
      </button>
      <span className="text-slate-300">—</span>
      <button onClick={(e) => { e.stopPropagation(); onEdit(s.Id, 'EDIT_END'); }} className="hover:underline">
        {eEdit && eEdit.override_end !== oE ? <><span className="line-through text-slate-300 print:text-slate-400">{oE}</span> <span className="text-blue-600 print:text-black">({eEdit.override_end})</span></> : <span className="text-orange-600 print:text-black">{oE}</span>}
      </button>
    </div>
  );
}