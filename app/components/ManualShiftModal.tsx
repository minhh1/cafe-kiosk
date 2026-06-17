export default function ManualShiftModal({ data, setData, onSave, onClose, existingShifts }: any) {
  // Check if this specific name already has an active shift on this specific date
  const isDuplicate = existingShifts.some((s: any) => 
    s._DPMetaData?.EmployeeInfo?.DisplayName?.toLowerCase() === data.name?.toLowerCase() && 
    (s.IsManual ? s.Date === data.date : new Date(s.StartTime * 1000).toISOString().split('T')[0] === data.date)
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[500] backdrop-blur-sm">
      <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl text-left">
        <h2 className="text-2xl font-black mb-6 uppercase italic tracking-tighter text-slate-800">Add Temporary Shift</h2>
        
        {isDuplicate && data.name && data.date && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4 text-amber-800 text-[10px] font-bold rounded-lg animate-pulse">
                ⚠️ WARNING: A shift already exists for this person on this date.
            </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase ml-1 opacity-50 text-slate-500">Staff Name</label>
            <input className="w-full p-4 border-2 border-slate-100 rounded-2xl outline-none focus:border-orange-500 bg-slate-50 text-slate-900" value={data.name} onChange={e => setData({...data, name: e.target.value})} placeholder="e.g. John Smith" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase ml-1 opacity-50 text-slate-500">Date</label>
            <input type="date" className="w-full p-4 border-2 border-slate-100 rounded-2xl outline-none focus:border-orange-500 bg-slate-50 text-slate-900" value={data.date} onChange={e => setData({...data, date: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase ml-1 opacity-50 text-slate-500">Start Time</label>
                <input type="time" className="p-4 border-2 border-slate-100 rounded-2xl outline-none focus:border-orange-500 bg-slate-50 text-slate-900 font-bold" value={data.start} onChange={e => setData({...data, start: e.target.value})} />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase ml-1 opacity-50 text-slate-500">Finish Time</label>
                <input type="time" className="p-4 border-2 border-slate-100 rounded-2xl outline-none focus:border-orange-500 bg-slate-50 text-slate-900 font-bold" value={data.end} onChange={e => setData({...data, end: e.target.value})} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase ml-1 opacity-50 text-slate-500">Team</label>
            <select className="w-full p-4 border-2 border-slate-100 rounded-2xl bg-white outline-none focus:border-orange-500 text-slate-900" value={data.team} onChange={e => setData({...data, team: e.target.value})}>
                <option>FOH Team</option>
                <option>BOH Team</option>
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button 
                disabled={isDuplicate || !data.name || !data.date || !data.start || !data.end} 
                onClick={onSave} 
                className={`flex-1 p-4 rounded-2xl font-black uppercase text-xs shadow-lg transition-all ${isDuplicate || !data.name ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-orange-600'}`}
            >
                Create Shift
            </button>
            <button onClick={onClose} className="px-6 bg-slate-100 text-slate-500 rounded-2xl uppercase text-xs font-bold hover:bg-slate-200">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}