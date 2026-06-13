"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const STATUS_COLORS: any = {
  ON_TIME: { bg: 'bg-green-600', border: 'border-green-200', text: 'text-green-700', light: 'bg-green-50', ring: 'ring-green-600' },
  LATE: { bg: 'bg-amber-500', border: 'border-amber-200', text: 'text-amber-700', light: 'bg-amber-50', ring: 'ring-amber-500' },
  NO_SHOW: { bg: 'bg-red-600', border: 'border-red-200', text: 'text-red-700', light: 'bg-red-50', ring: 'ring-red-600' },
  OTHER: { bg: 'bg-slate-500', border: 'border-slate-200', text: 'text-slate-700', light: 'bg-slate-50', ring: 'ring-slate-500' },
};

export default function ManagerDashboard() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [coffeeStats, setCoffeeStats] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const [activeForm, setActiveForm] = useState<{id: any, type: string} | null>(null);
  const [formTime, setFormTime] = useState("");
  const [formNote, setFormNote] = useState("");
  const [dailyCoffee, setDailyCoffee] = useState<string>("0");

  const getWeekRange = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { mon: mon.toISOString().split('T')[0], sun: sun.toISOString().split('T')[0] };
  };

  const fetchData = async () => {
    setLoading(true);
    const range = getWeekRange(selectedDate);
    const startDate = viewMode === 'daily' ? selectedDate : range.mon;
    const endDate = viewMode === 'daily' ? selectedDate : range.sun;

    try {
      const rosterRes = await fetch(`/api/roster?startDate=${startDate}&endDate=${endDate}`);
      const deputyData = await rosterRes.json();
      const { data: logs } = await supabase.from('attendance_logs').select('*').order('created_at', { ascending: false });
      const { data: coffee } = await supabase.from('daily_stats').select('*').gte('date', startDate).lte('date', endDate);

      setShifts(Array.isArray(deputyData) ? deputyData : []);
      setAttendanceLogs(logs || []);
      setCoffeeStats(coffee || []);
      setDailyCoffee(coffee?.find(c => c.date === selectedDate)?.coffee_kg?.toString() || "0");
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [selectedDate, viewMode]);

  const saveCoffee = async (val: string) => {
    setDailyCoffee(val);
    await supabase.from('daily_stats').upsert({ date: selectedDate, coffee_kg: parseFloat(val) || 0 });
  };

  const getLatestLog = (shiftId: any) => attendanceLogs.find(l => l.shift_id.toString() === shiftId.toString() && !l.action_type.startsWith('EDIT'));

  // HELPER: Converts "14:30" to "2:30 pm"
  const formatTimeString = (timeStr: string) => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'pm' : 'am';
    const displayH = h % 12 || 12;
    return `${displayH}:${minutes} ${ampm}`;
  };

  const submitAttendance = async (shift: any, type: string) => {
    if ((type === 'OTHER' || type === 'LATE' || type === 'NO_SHOW') && !formNote.trim()) {
      return alert("Note is mandatory for this status.");
    }
    if (type.startsWith('EDIT') && !formTime) {
        return alert("Please select a time.");
    }

    const { error } = await supabase.from('attendance_logs').insert({
      shift_id: shift.Id.toString(),
      staff_name: shift._DPMetaData?.EmployeeInfo?.DisplayName,
      action_type: type,
      notes: formNote,
      override_start: type === 'EDIT_START' ? formatTimeString(formTime) : null,
      override_end: type === 'EDIT_END' ? formatTimeString(formTime) : null
    });

    if (!error) { setActiveForm(null); setFormNote(""); setFormTime(""); fetchData(); }
  };

  const renderTimeDisplay = (s: any, isCompact = false) => {
    const logs = attendanceLogs.filter(l => l.shift_id.toString() === s.Id.toString());
    const startLog = logs.find(l => l.action_type === 'EDIT_START');
    const endLog = logs.find(l => l.action_type === 'EDIT_END');

    const origStart = new Date(s.StartTime * 1000).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    const origEnd = new Date(s.EndTime * 1000).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();

    return (
      <div className={`${isCompact ? 'text-[10px]' : 'text-lg'} font-bold flex flex-wrap items-center gap-2`}>
        <button onClick={(e) => { e.stopPropagation(); setActiveForm({id: s.Id, type: 'EDIT_START'}); }} className="flex items-center gap-1 group">
          {startLog ? (
            <><span className="line-through text-slate-300 font-normal">{origStart}</span><span className="text-blue-600 font-black">({startLog.override_start})</span></>
          ) : <span className="text-orange-600 group-hover:underline">{origStart}</span>}
        </button>
        <span className="text-slate-300">—</span>
        <button onClick={(e) => { e.stopPropagation(); setActiveForm({id: s.Id, type: 'EDIT_END'}); }} className="flex items-center gap-1 group">
          {endLog ? (
            <><span className="line-through text-slate-300 font-normal">{origEnd}</span><span className="text-blue-600 font-black">({endLog.override_end})</span></>
          ) : <span className="text-orange-600 group-hover:underline">{origEnd}</span>}
        </button>
      </div>
    );
  };

  const renderActionButtons = (s: any, currentLog: any) => (
    <div className="flex flex-wrap gap-1">
      {['ON_TIME', 'LATE', 'NO_SHOW', 'OTHER'].map(type => (
        <button key={type} onClick={(e) => { e.stopPropagation(); type !== 'ON_TIME' ? setActiveForm({id: s.Id, type}) : submitAttendance(s, type)}} 
          className={`px-3 py-2 rounded-lg font-bold text-[9px] uppercase transition-all ${currentLog?.action_type === type ? STATUS_COLORS[type].bg + " text-white scale-110 shadow-lg" : "bg-slate-100 text-slate-400 opacity-40 hover:opacity-100"}`}>
          {type.replace('_', ' ')}
        </button>
      ))}
    </div>
  );

  const renderEditForm = (s: any) => {
    if (!activeForm || activeForm.id !== s.Id) return null;
    const isTimeEdit = activeForm.type.startsWith('EDIT');
    const isStatusNote = ['LATE', 'NO_SHOW', 'OTHER'].includes(activeForm.type);

    return (
      <div className="mt-4 p-5 bg-slate-800 rounded-2xl shadow-xl animate-in zoom-in-95 text-left">
        <h4 className="text-orange-400 text-[10px] font-bold uppercase mb-4 tracking-widest">{activeForm.type.replace('_', ' ')} Details</h4>
        <div className="flex flex-col gap-3">
          {isTimeEdit ? (
            <div className="bg-slate-700 p-4 rounded-xl">
                 <label className="text-white text-[10px] block mb-2 font-bold uppercase opacity-50">Select New Time</label>
                 <input type="time" className="w-full p-4 rounded-xl bg-white text-slate-900 font-black text-2xl outline-none" value={formTime} onChange={e => setFormTime(e.target.value)} />
            </div>
          ) : (
            <textarea autoFocus placeholder="Mandatory Reason/Note..." className="p-4 rounded-xl bg-slate-700 text-white h-20 outline-none" value={formNote} onChange={e => setFormNote(e.target.value)} />
          )}
          <div className="flex gap-2">
            <button onClick={() => submitAttendance(s, activeForm.type)} className="flex-1 bg-white text-slate-900 p-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg">Save Correction</button>
            <button onClick={() => setActiveForm(null)} className="px-6 bg-slate-600 text-white rounded-xl font-bold text-xs uppercase">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  const renderDailyCard = (s: any) => {
    const log = getLatestLog(s.Id);
    const theme = log ? STATUS_COLORS[log.action_type] : null;

    return (
      <div key={s.Id} className={`bg-white p-5 rounded-2xl shadow-sm border mb-4 transition-all ${theme ? theme.border : 'border-slate-200'}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-2xl font-black text-slate-900 uppercase leading-none">{s._DPMetaData?.EmployeeInfo?.DisplayName}</h2>
            <div className="mt-2 text-left">{renderTimeDisplay(s)}</div>
          </div>
          {renderActionButtons(s, log)}
        </div>
        {log && theme && (
          <div className={`mt-4 p-3 rounded-xl border text-xs ${theme.light} ${theme.text}`}>
            <strong>{log.action_type.replace('_', ' ')}:</strong> {log.notes}
          </div>
        )}
        {renderEditForm(s)}
      </div>
    );
  };

  const renderWeeklySection = (teamShifts: any[]) => {
    const grouped: { [key: string]: any[] } = {};
    teamShifts.forEach(s => {
      const name = s._DPMetaData?.EmployeeInfo?.DisplayName || "Unknown";
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(s);
    });

    return Object.entries(grouped).map(([name, staffShifts]) => {
      const activeShiftInRow = staffShifts.find(s => activeForm?.id === s.Id);
      return (
        <div key={name} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase border-b pb-3 mb-4 tracking-tighter">{name}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3 mb-2">
            {staffShifts.sort((a,b) => a.StartTime - b.StartTime).map(s => {
              const log = getLatestLog(s.Id);
              const theme = log ? STATUS_COLORS[log.action_type] : null;
              const isSelected = activeForm?.id === s.Id;
              return (
                <div key={s.Id} onClick={() => setActiveForm({id: s.Id, type: 'MARK'})}
                  className={`p-3 rounded-xl border text-center flex flex-col justify-between min-h-[120px] cursor-pointer transition-all ${isSelected ? 'ring-4 ring-orange-500/20 border-orange-500 shadow-md scale-105 z-10' : (log && theme ? `${theme.light} ${theme.border}` : 'bg-slate-50 border-slate-100')}`}>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-2">{new Date(s.StartTime * 1000).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' })}</p>
                    {renderTimeDisplay(s, true)}
                  </div>
                  {log && theme && <p className={`mt-2 pt-2 border-t ${theme.border} text-[9px] font-black ${theme.text} uppercase`}>{log.action_type}</p>}
                </div>
              );
            })}
          </div>
          {activeShiftInRow && (
            <div className="mt-4 p-4 bg-slate-50 rounded-xl border-2 border-slate-200 animate-in slide-in-from-top-2">
               <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Updating Record</p>
                  {renderActionButtons(activeShiftInRow, getLatestLog(activeShiftInRow.Id))}
               </div>
               {renderEditForm(activeShiftInRow)}
            </div>
          )}
        </div>
      );
    });
  };

  const weeklyCoffeeTotal = coffeeStats.reduce((acc, curr) => acc + (curr.coffee_kg || 0), 0);
  const weekRange = getWeekRange(selectedDate);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 pb-20 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="bg-white p-6 rounded-3xl shadow-sm mb-8 border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex-1">
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Martin Place Log</h1>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setViewMode('daily')} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'daily' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Daily</button>
              <button onClick={() => setViewMode('weekly')} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'weekly' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Weekly</button>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="bg-orange-50 border border-orange-200 p-3 rounded-2xl flex items-center gap-4">
                <span className="text-[10px] font-black text-orange-800 uppercase tracking-widest">Coffee Used (kg)</span>
                <input type="number" step="0.1" value={dailyCoffee} onChange={e => saveCoffee(e.target.value)} className="w-20 p-2 rounded-xl font-black text-center bg-white text-orange-600 border-none outline-none shadow-inner" />
            </div>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-3 border-2 border-slate-200 rounded-2xl font-bold bg-white text-slate-900 shadow-sm" />
          </div>
        </header>

        {viewMode === 'weekly' && (
          <div className="mb-8 flex justify-between items-center bg-slate-800 text-white p-6 rounded-3xl shadow-lg">
             <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1 leading-none">Business Week (Mon-Sun)</p>
                <p className="text-lg font-bold">{new Date(weekRange.mon).toLocaleDateString()} — {new Date(weekRange.sun).toLocaleDateString()}</p>
             </div>
             <div className="text-right"><p className="text-[10px] font-black text-orange-400 uppercase mb-1 leading-none">Weekly Coffee Total</p>
                <p className="text-4xl font-black text-orange-50">{weeklyCoffeeTotal.toFixed(1)} <span className="text-sm">KG</span></p>
             </div>
          </div>
        )}

        <div className="mb-10">
          <h2 className="text-xs font-black text-white bg-slate-800 px-5 py-1.5 inline-block rounded-t-xl uppercase ml-2 tracking-widest">FOH Team</h2>
          <div className="border-t-4 border-slate-800 pt-6">
            {viewMode === 'daily' ? shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === "FOH Team").map(renderDailyCard) : renderWeeklySection(shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === "FOH Team"))}
          </div>
        </div>
        <div>
          <h2 className="text-xs font-black text-white bg-orange-600 px-5 py-1.5 inline-block rounded-t-xl uppercase ml-2 tracking-widest">BOH Team</h2>
          <div className="border-t-4 border-orange-600 pt-6">
            {viewMode === 'daily' ? shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === "BOH Team").map(renderDailyCard) : renderWeeklySection(shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === "BOH Team"))}
          </div>
        </div>
      </div>
    </div>
  );
}