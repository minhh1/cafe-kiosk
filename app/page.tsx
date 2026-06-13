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
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  // Form States
  const [showManualModal, setShowManualModal] = useState(false);
  const [activeForm, setActiveForm] = useState<{id: any, type: string} | null>(null);
  const [formTime, setFormTime] = useState("");
  const [formNote, setFormNote] = useState("");
  const [newShift, setNewShift] = useState({ name: '', start: '', end: '', team: 'FOH Team' });

  const fetchData = async () => {
    setLoading(true);
    let startDate = selectedDate;
    let endDate = selectedDate;

    if (viewMode === 'weekly') {
      const end = new Date(selectedDate);
      end.setDate(end.getDate() + 6);
      endDate = end.toISOString().split('T')[0];
    }

    try {
      // 1. Fetch Deputy Roster
      const rosterRes = await fetch(`/api/roster?startDate=${startDate}&endDate=${endDate}`);
      const deputyData = await rosterRes.json();
      
      // 2. Fetch Manual Shifts from Supabase
      const { data: manualData } = await supabase
        .from('manual_shifts')
        .select('*')
        .gte('shift_date', startDate)
        .lte('shift_date', endDate);

      // 3. Fetch Attendance Logs
      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('*')
        .order('created_at', { ascending: false });

      // Transform Manual Data so it works with our existing UI
      const formattedManual = (manualData || []).map(m => ({
        Id: `manual-${m.id}`, // String ID
        IsManual: true,
        DisplayName: m.staff_name,
        StartTime: m.start_time_str,
        EndTime: m.end_time_str,
        Team: m.team,
        Date: m.shift_date,
        _DPMetaData: { 
            EmployeeInfo: { DisplayName: m.staff_name },
            OperationalUnitInfo: { OperationalUnitName: m.team }
        }
      }));

      setShifts([...(Array.isArray(deputyData) ? deputyData : []), ...formattedManual]);
      setAttendanceLogs(logs || []);
    } catch (e) { 
      console.error(e); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { fetchData(); }, [selectedDate, viewMode]);

  const createManualShift = async () => {
    if (!newShift.name || !newShift.start || !newShift.end) return alert("Please fill all fields");
    const { error } = await supabase.from('manual_shifts').insert({
      staff_name: newShift.name,
      start_time_str: newShift.start,
      end_time_str: newShift.end,
      team: newShift.team,
      shift_date: selectedDate
    });
    if (!error) {
      setShowManualModal(false);
      setNewShift({ name: '', start: '', end: '', team: 'FOH Team' });
      fetchData();
    }
  };

  const submitAttendance = async (shift: any, type: string) => {
    if ((type === 'OTHER' || type === 'LATE') && !formNote.trim()) return alert("Note required");
    
    const staffName = shift._DPMetaData?.EmployeeInfo?.DisplayName || "Staff";

    const { error } = await supabase.from('attendance_logs').insert({
      shift_id: shift.Id.toString(), // CRUCIAL: ID must be a string
      staff_name: staffName,
      action_type: type,
      notes: formNote,
      updated_start_time: formTime
    });

    if (!error) { 
        setActiveForm(null); 
        setFormNote(""); 
        setFormTime(""); 
        fetchData(); 
    } else {
        alert("Error: " + error.message);
    }
  };

  const getDisplayTime = (s: any) => {
    if (s.IsManual) return `${s.StartTime} — ${s.EndTime}`;
    const start = new Date(s.StartTime * 1000).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    const end = new Date(s.EndTime * 1000).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    return `${start} — ${end}`;
  };

  const getDayLabel = (s: any) => {
    const d = s.IsManual ? new Date(s.Date) : new Date(s.StartTime * 1000);
    return `${d.toLocaleDateString('en-AU', { weekday: 'short' })} ${d.getDate()}/${d.getMonth()+1}`;
  };

  const getLatestLog = (shiftId: any) => attendanceLogs.find(l => l.shift_id.toString() === shiftId.toString());

  const getBtnClass = (btnType: string, currentStatus?: string) => {
    const base = "px-3 py-2 rounded-lg font-bold text-[9px] uppercase transition-all duration-200 ";
    const theme = STATUS_COLORS[btnType];
    if (!currentStatus) return base + theme.bg + " text-white hover:opacity-80";
    const isSelected = btnType === currentStatus;
    return base + theme.bg + " text-white " + (isSelected ? `ring-2 ring-offset-2 ${theme.ring} scale-110 z-10 shadow-lg` : "opacity-20 grayscale scale-90");
  };

  const renderDailyCard = (s: any) => {
    const log = getLatestLog(s.Id);
    const theme = log ? STATUS_COLORS[log.action_type] : null;

    return (
      <div key={s.Id} className={`bg-white p-5 rounded-2xl shadow-sm border mb-4 transition-all ${log ? theme.border : 'border-slate-200'}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1">
            <span className="text-[9px] font-bold bg-slate-100 text-slate-400 px-2 py-0.5 rounded uppercase mb-1 inline-block">{getDayLabel(s)}</span>
            <h2 className="text-2xl font-black text-slate-900 uppercase leading-none">{s._DPMetaData?.EmployeeInfo?.DisplayName}</h2>
            <p className="text-orange-600 font-bold text-lg">{getDisplayTime(s)}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {['ON_TIME', 'LATE', 'NO_SHOW', 'OTHER'].map(type => (
              <button 
                key={type} 
                onClick={() => (type === 'LATE' || type === 'OTHER' ? setActiveForm({id: s.Id, type}) : submitAttendance(s, type))} 
                className={getBtnClass(type, log?.action_type)}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {log && theme && (
          <div className={`mt-4 p-3 rounded-xl border ${theme.light} ${theme.border}`}>
            <div className="flex justify-between items-center">
                <p className={`text-xs font-black uppercase ${theme.text}`}>Status: {log.action_type.replace('_', ' ')} {log.updated_start_time && `— Arrived ${log.updated_start_time}`}</p>
                <span className="text-[9px] text-slate-400 font-bold uppercase">Updated: {new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
            </div>
            {log.notes && <p className="text-xs text-slate-500 italic mt-1 leading-tight border-t pt-1 border-black/5">"{log.notes}"</p>}
          </div>
        )}

        {/* FORM BOX WITH TYPESCRIPT GUARD */}
        {activeForm && activeForm.id === s.Id && (
          <div className="mt-4 p-5 bg-slate-800 rounded-2xl shadow-xl animate-in zoom-in-95 duration-200">
            <h4 className="text-orange-400 text-[10px] font-bold uppercase mb-4 tracking-widest">Provide Reason for {activeForm.type}</h4>
            <div className="flex flex-col gap-3">
              {activeForm.type === 'LATE' && (
                <input type="text" placeholder="Actual Start Time (e.g. 7:15am)" className="p-3 rounded-xl bg-slate-700 text-white border-none outline-none" onChange={e => setFormTime(e.target.value)} />
              )}
              <textarea placeholder="Manager's Note (Mandatory)..." className="p-3 rounded-xl bg-slate-700 text-white border-none h-24 outline-none" onChange={e => setFormNote(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => activeForm && submitAttendance(s, activeForm.type)} className="flex-1 bg-white text-slate-900 p-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg">Submit Record</button>
                <button onClick={() => setActiveForm(null)} className="px-6 bg-slate-600 text-white rounded-xl font-bold text-xs uppercase">Cancel</button>
              </div>
            </div>
          </div>
        )}
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

    return Object.entries(grouped).map(([name, staffShifts]) => (
      <div key={name} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6">
        <h3 className="text-xl font-black text-slate-800 uppercase border-b pb-3 mb-4 tracking-tighter">{name}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
          {staffShifts.sort((a, b) => {
                // Convert everything to a numeric timestamp for sorting
                const timeA = a.IsManual ? new Date(a.Date).getTime() : a.StartTime * 1000;
                const timeB = b.IsManual ? new Date(b.Date).getTime() : b.StartTime * 1000;
                return timeA - timeB;
            }).map(s => {
            const log = getLatestLog(s.Id);
            const theme = log ? STATUS_COLORS[log.action_type] : null;
            return (
              <div key={s.Id} className={`p-3 rounded-xl border text-center flex flex-col justify-between min-h-[110px] transition-all ${log ? `${theme.light} ${theme.border} shadow-inner` : 'bg-slate-50 border-slate-100'}`}>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">{getDayLabel(s)}</p>
                  <p className="text-[11px] font-bold text-slate-700 leading-tight">{getDisplayTime(s)}</p>
                </div>
                {log && <p className={`mt-2 pt-2 border-t ${theme.border} text-[10px] font-black ${theme.text} uppercase`}>{log.action_type}</p>}
              </div>
            );
          })}
        </div>
      </div>
    ));
  };

  const foh = shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === "FOH Team");
  const boh = shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === "BOH Team");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 font-sans pb-20">
      <div className="max-w-5xl mx-auto">
        
        {/* TOP BAR */}
        <div className="bg-white p-6 rounded-3xl shadow-sm mb-8 border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter leading-none">Naked Duck Martin Place Log</h1>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setViewMode('daily')} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'daily' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Daily View</button>
              <button onClick={() => setViewMode('weekly')} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'weekly' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Weekly View</button>
            </div>
          </div>
          <div className="flex gap-3 items-center">
             <button onClick={() => setShowManualModal(true)} className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-orange-500 transition-colors">+ Create Shift</button>
             <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-3 border-2 border-slate-200 rounded-2xl font-bold bg-white" />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-40 font-black text-slate-200 text-4xl animate-pulse tracking-widest uppercase">Refreshing Data</div>
        ) : (
          <div className="animate-in fade-in duration-500">
            <div className="mb-12">
              <h2 className="text-xs font-black text-white bg-slate-800 px-5 py-1.5 inline-block rounded-t-xl uppercase tracking-widest ml-2 shadow-md">FOH Team</h2>
              <div className="border-t-4 border-slate-800 pt-6">
                {viewMode === 'daily' ? foh.map(renderDailyCard) : renderWeeklySection(foh)}
                {foh.length === 0 && <p className="text-slate-300 p-6 italic">No FOH shifts scheduled.</p>}
              </div>
            </div>
            <div className="mb-12">
              <h2 className="text-xs font-black text-white bg-orange-600 px-5 py-1.5 inline-block rounded-t-xl uppercase tracking-widest ml-2 shadow-md">BOH Team</h2>
              <div className="border-t-4 border-orange-600 pt-6">
                {viewMode === 'daily' ? boh.map(renderDailyCard) : renderWeeklySection(boh)}
                {boh.length === 0 && <p className="text-slate-300 p-6 italic">No BOH shifts scheduled.</p>}
              </div>
            </div>
          </div>
        )}

        {/* CREATE SHIFT MODAL */}
        {showManualModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200">
              <h2 className="text-2xl font-black mb-6 uppercase italic tracking-tighter">Add Temporary Shift</h2>
              <div className="space-y-4">
                <input placeholder="Staff Name" className="w-full p-4 border-2 border-slate-100 rounded-2xl bg-slate-50 outline-none focus:border-orange-500" value={newShift.name} onChange={e => setNewShift({...newShift, name: e.target.value})} />
                <div className="grid grid-cols-2 gap-4">
                    <input placeholder="Start (e.g. 7am)" className="p-4 border-2 border-slate-100 rounded-2xl bg-slate-50 outline-none" value={newShift.start} onChange={e => setNewShift({...newShift, start: e.target.value})} />
                    <input placeholder="End (e.g. 3pm)" className="p-4 border-2 border-slate-100 rounded-2xl bg-slate-50 outline-none" value={newShift.end} onChange={e => setNewShift({...newShift, end: e.target.value})} />
                </div>
                <select className="w-full p-4 border-2 border-slate-100 rounded-2xl bg-slate-50 outline-none" value={newShift.team} onChange={e => setNewShift({...newShift, team: e.target.value})}>
                    <option>FOH Team</option>
                    <option>BOH Team</option>
                </select>
                <div className="flex gap-3 pt-4">
                    <button onClick={createManualShift} className="flex-1 bg-slate-900 text-white p-4 rounded-2xl font-black uppercase tracking-widest shadow-lg">Create Shift</button>
                    <button onClick={() => setShowManualModal(false)} className="px-6 bg-slate-100 rounded-2xl font-bold uppercase text-xs">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}