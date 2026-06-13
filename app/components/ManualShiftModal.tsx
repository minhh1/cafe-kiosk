import React from 'react';

export default function ManualShiftModal({ data, setData, onSave, onClose, existingShifts }: any) {
  // Check if this specific name already has an ACTIVE shift on this specific date
  const isDuplicate = existingShifts.some((s: any) => 
    s._DPMetaData?.EmployeeInfo?.DisplayName?.toLowerCase() === data.name?.toLowerCase() && 
    (s.IsManual ? s.Date === data.date : new Date(s.StartTime * 1000).toISOString().split('T')[0] === data.date)
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl text-left">
        <h2 className="text-2xl font-black mb-6 uppercase italic tracking-tighter">Add Temporary Shift</h2>
        
        {isDuplicate && data.name && data.date && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4 text-amber-800 text-xs font-bold animate-pulse">
                ⚠️ WARNING: A shift has already been entered for "{data.name}" on this date. Please edit that shift instead.
            </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase ml-1 opacity-50">Staff Name</label>
            <input className="w-full p-4 border-2 border-slate-100 rounded-2xl outline-none focus:border-orange-500" placeholder="e.g. John Smith" value={data.name} onChange={e => setData({...data, name: e.target.value})} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase ml-1 opacity-50">Shift Date</label>
            <input type="date" className="w-full p-4 border-2 border-slate-100 rounded-2xl outline-none focus:border-orange-500" value={data.date} onChange={e => setData({...data, date: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase ml-1 opacity-50">Start Time</label>
                <input type="time" className="p-4 border-2 border-slate-100 rounded-2xl outline-none focus:border-orange-500" value={data.start} onChange={e => setData({...data, start: e.target.value})} />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase ml-1 opacity-50">Finish Time</label>
                <input type="time" className="p-4 border-2 border-slate-100 rounded-2xl outline-none focus:border-orange-500" value={data.end} onChange={e => setData({...data, end: e.target.value})} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase ml-1 opacity-50">Team</label>
            <select className="w-full p-4 border-2 border-slate-100 rounded-2xl bg-white outline-none" value={data.team} onChange={e => setData({...data, team: e.target.value})}>
                <option>FOH Team</option>
                <option>BOH Team</option>
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button 
                disabled={isDuplicate || !data.name || !data.date || !data.start || !data.end} 
                onClick={onSave} 
                className={`flex-1 p-4 rounded-2xl font-black uppercase text-xs transition-all ${isDuplicate || !data.name ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white shadow-lg hover:bg-orange-600'}`}
            >
                Create Shift
            </button>
            <button onClick={onClose} className="px-6 bg-slate-100 rounded-2xl uppercase text-xs font-bold hover:bg-slate-200">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}