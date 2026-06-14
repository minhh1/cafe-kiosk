export default function ManualShiftModal({ data, setData, onSave, onClose, existingShifts }: any) {
  const isDuplicate = existingShifts.some((s: any) => 
    s._DPMetaData?.EmployeeInfo?.DisplayName?.toLowerCase() === data.name?.toLowerCase() && 
    (s.IsManual ? s.Date === data.date : new Date(s.StartTime * 1000).toISOString().split('T')[0] === data.date)
  );
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[100] backdrop-blur-sm">
      <div className="bg-white p-6 sm:p-8 rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl text-left">
        <h2 className="text-xl font-black mb-4 uppercase italic">Temporary Shift</h2>
        {isDuplicate && data.name && data.date && <div className="bg-amber-50 p-3 mb-4 text-amber-800 text-[10px] font-bold rounded-lg border-l-4 border-amber-500">⚠️ Shift already exists for this date.</div>}
        <div className="space-y-4">
          <input placeholder="Staff Name" className="w-full p-4 border rounded-2xl bg-slate-50 outline-none" value={data.name} onChange={e => setData({...data, name: e.target.value})} />
          <input type="date" className="w-full p-4 border rounded-2xl bg-slate-50 outline-none" value={data.date} onChange={e => setData({...data, date: e.target.value})} />
          <div className="grid grid-cols-2 gap-2">
            <input type="time" className="w-full p-4 border rounded-2xl bg-slate-50 text-slate-900" value={data.start} onChange={e => setData({...data, start: e.target.value})} />
            <input type="time" className="w-full p-4 border rounded-2xl bg-slate-50 text-slate-900" value={data.end} onChange={e => setData({...data, end: e.target.value})} />
          </div>
          <select className="w-full p-4 border rounded-2xl bg-slate-50 outline-none" value={data.team} onChange={e => setData({...data, team: e.target.value})}><option>FOH Team</option><option>BOH Team</option></select>
          <div className="flex gap-2 pt-2"><button disabled={isDuplicate} onClick={onSave} className="flex-1 bg-slate-900 text-white p-4 rounded-2xl font-black uppercase text-xs">Create</button><button onClick={onClose} className="px-6 bg-slate-100 rounded-2xl uppercase text-xs font-bold">Cancel</button></div>
        </div>
      </div>
    </div>
  );
}