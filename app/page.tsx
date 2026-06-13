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

  // Form States
  const [activeForm, setActiveForm] = useState<{id: any, type: string} | null>(null);
  const [formTime, setFormTime] = useState("");
  const [formNote, setFormNote] = useState("");
  
  // Coffee States
  const [coffeeStandard, setCoffeeStandard] = useState<string>("");
  const [coffeeExtra, setCoffeeExtra] = useState<string>("");
  const [coffeeOperator, setCoffeeOperator] = useState<'+' | '-'>('+');
  const [isCoffeeConfirmed, setIsCoffeeConfirmed] = useState<boolean>(false);

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
      
      const { data: manualData } = await supabase.from('manual_shifts').select('*').gte('shift_date', startDate).lte('shift_date', endDate);
      const { data: logs } = await supabase.from('attendance_logs').select('*').order('created_at', { ascending: false });
      const { data: coffee } = await supabase.from('daily_stats').select('*').gte('date', range.mon).lte('date', range.sun);

      const formattedManual = (manualData || []).map(m => ({
        Id: `manual-${m.id}`,
        IsManual: true,
        DisplayName: m.staff_name,
        StartTime: m.start_time_str,
        EndTime: m.end_time_str,
        Team: m.team,
        Date: m.shift_date,
        _DPMetaData: { EmployeeInfo: { DisplayName: m.staff_name }, OperationalUnitInfo: { OperationalUnitName: m.team } }
      }));

      setShifts([...(Array.isArray(deputyData) ? deputyData : []), ...formattedManual]);
      setAttendanceLogs(logs || []);
      setCoffeeStats(coffee || []);
      
      const todayCoffee = coffee?.find(c => c.date === selectedDate);
      setCoffeeStandard(todayCoffee?.coffee_standard?.toString() || "");
      setCoffeeExtra(todayCoffee?.coffee_extra?.toString() || "");
      setCoffeeOperator(todayCoffee?.coffee_operator || '+');
      setIsCoffeeConfirmed(todayCoffee?.is_confirmed || false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [selectedDate, viewMode]);

  const handleConfirmCoffee = async () => {
    const std = parseFloat(coffeeStandard) || 10;
    const ext = parseFloat(coffeeExtra) || 0;
    const total = coffeeOperator === '+' ? std + ext : std - ext;
    await supabase.from('daily_stats').upsert({ 
      date: selectedDate, coffee_standard: std, coffee_extra: ext, 
      coffee_operator: coffeeOperator, coffee_total: total, is_confirmed: true 
    });
    setIsCoffeeConfirmed(true);
    fetchData();
  };

  const getLatestLog = (shiftId: any) => attendanceLogs.find(l => l.shift_id.toString() === shiftId.toString() && !l.action_type.startsWith('EDIT'));

  const formatTimeString = (timeStr: string) => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    return `${h % 12 || 12}:${minutes} ${h >= 12 ? 'pm' : 'am'}`;
  };

  const submitAttendance = async (shift: any, type: string) => {
    if ((type === 'OTHER' || type === 'LATE' || type === 'NO_SHOW') && !formNote.trim()) return alert("Note is mandatory.");
    const { error } = await supabase.from('attendance_logs').insert({
      shift_id: shift.Id.toString(), staff_name: shift._DPMetaData?.EmployeeInfo?.DisplayName,
      action_type: type, notes: formNote,
      override_start: type === 'EDIT_START' ? formatTimeString(formTime) : null,
      override_end: type === 'EDIT_END' ? formatTimeString(formTime) : null
    });
    if (!error) { setActiveForm(null); setFormNote(""); setFormTime(""); fetchData(); }
  };

  // --- TIME DISPLAY WITH STRIKE-THROUGH LOGIC ---
  const renderTimeDisplay = (s: any, isCompact = false) => {
    const logs = attendanceLogs.filter(l => l.shift_id.toString() === s.Id.toString());
    const startLog = logs.find(l => l.action_type === 'EDIT_START');
    const endLog = logs.find(l => l.action_type === 'EDIT_END');

    const format = (val: any) => typeof val === 'number' 
      ? new Date(val * 1000).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
      : val;

    const origStart = format(s.StartTime);
    const origEnd = format(s.EndTime);

    return (
      <div className={`${isCompact ? 'text-[10px]' : 'text-lg'} font-bold flex flex-wrap items-center gap-1`}>
        {/* START TIME */}
        <button onClick={(e) => { e.stopPropagation(); setActiveForm({id: s.Id, type: 'EDIT_START'}); }} className="flex items-center gap-1">
          {startLog ? (
            <><span className="line-through decoration-slate-400 text-slate-300 font-normal">{origStart}</span> <span className="text-blue-600 font-black">({startLog.override_start})</span></>
          ) : <span className="text-orange-600">{origStart}</span>}
        </button>
        <span className="text-slate-300">—</span>
        {/* END TIME */}
        <button onClick={(e) => { e.stopPropagation(); setActiveForm({id: s.Id, type: 'EDIT_END'}); }} className="flex items-center gap-1">
          {endLog ? (
            <><span className="line-through decoration-slate-400 text-slate-300 font-normal">{origEnd}</span> <span className="text-blue-600 font-black">({endLog.override_end})</span></>
          ) : <span className="text-orange-600">{origEnd}</span>}
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
    return (
      <div className="mt-4 p-5 bg-slate-800 rounded-2xl shadow-xl animate-in zoom-in-95 text-left">
        <h4 className="text-orange-400 text-[10px] font-bold uppercase mb-4 tracking-widest">{activeForm.type.replace('_', ' ')} Details</h4>
        <div className="flex flex-col gap-3">
          {activeForm.type.startsWith('EDIT') ? <input type="time" className="p-4 rounded-xl bg-white text-slate-900 font-black text-2xl" value={formTime} onChange={e => setFormTime(e.target.value)} /> 
          : <textarea autoFocus placeholder="Mandatory Note..." className="p-4 rounded-xl bg-slate-700 text-white h-20" value={formNote} onChange={e => setFormNote(e.target.value)} />}
          <div className="flex gap-2">
            <button onClick={() => submitAttendance(s, activeForm.type)} className="flex-1 bg-white text-slate-900 p-3 rounded-xl font-black uppercase text-xs">Save</button>
            <button onClick={() => setActiveForm(null)} className="px-6 bg-slate-600 text-white rounded-xl font-bold text-xs uppercase">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  const renderWeeklySection = (teamShifts: any[]) => {
    const grouped: { [key: string]: any[] } = {};
    teamShifts.forEach(s => {
      const name = s._DPMetaData?.EmployeeInfo?.DisplayName || "Unknown";
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(s);
    });

    return Object.entries(grouped).map(([name, staffShifts]) => {
      const activeInRow = staffShifts.find(s => activeForm?.id === s.Id);
      return (
        <div key={name} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase border-b pb-3 mb-4 tracking-tighter">{name}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3 mb-2">
            {staffShifts.sort((a,b) => {
                const tA = a.IsManual ? new Date(a.Date).getTime() : a.StartTime;
                const tB = b.IsManual ? new Date(b.Date).getTime() : b.StartTime;
                return tA - tB;
            }).map(s => {
              const log = getLatestLog(s.Id);
              const theme = log ? STATUS_COLORS[log.action_type] : null;
              const isSel = activeForm?.id === s.Id;
              const dateObj = s.IsManual ? new Date(s.Date) : new Date(s.StartTime * 1000);
              return (
                <div key={s.Id} onClick={() => setActiveForm({id: s.Id, type: 'MARK'})}
                  className={`p-3 rounded-xl border text-center flex flex-col justify-between min-h-[140px] cursor-pointer transition-all ${isSel ? 'ring-4 ring-orange-500/20 border-orange-500 shadow-md scale-105 z-10' : (log && theme ? `${theme.light} ${theme.border}` : 'bg-slate-50 border-slate-100')}`}>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-2">{dateObj.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' })}</p>
                    {renderTimeDisplay(s, true)}
                  </div>
                  {log && theme && (
                    <div className={`mt-2 pt-2 border-t ${theme.border}`}>
                      <p className={`text-[9px] font-black ${theme.text} uppercase leading-none mb-1`}>{log.action_type}</p>
                      {log.notes && <p className="text-[8px] text-slate-500 italic leading-tight line-clamp-2">"{log.notes}"</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {activeInRow && (
            <div className="mt-4 p-4 bg-slate-50 rounded-xl border-2 border-slate-200">
               <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase">Updating Record</p>
                  {renderActionButtons(activeInRow, getLatestLog(activeInRow.Id))}
               </div>
               {renderEditForm(activeInRow)}
            </div>
          )}
        </div>
      );
    });
  };

  const weekRange = getWeekRange(selectedDate);
  const confirmedWeeklyCoffee = coffeeStats.filter(c => c.is_confirmed).reduce((acc, curr) => acc + (curr.coffee_total || 0), 0);
  const getCoffeeForDate = (dateStr: string) => {
    const stat = coffeeStats.find(c => c.date === dateStr && c.is_confirmed);
    return stat ? `${stat.coffee_total.toFixed(1)}kg` : "—";
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 pb-20 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="bg-white p-6 rounded-3xl shadow-sm mb-8 border border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex-1 text-left">
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Martin Place Log</h1>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setViewMode('daily')} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'daily' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Daily View</button>
              <button onClick={() => setViewMode('weekly')} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'weekly' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Weekly View</button>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {viewMode === 'daily' && (
              <div className={`p-3 rounded-2xl flex items-center gap-3 transition-colors ${isCoffeeConfirmed ? 'bg-green-50 border-2 border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
                  <div className="flex flex-col items-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase">Standard</span>
                      <input disabled={isCoffeeConfirmed} type="number" placeholder="10" value={coffeeStandard} onChange={e => {setCoffeeStandard(e.target.value); setIsCoffeeConfirmed(false);}} className="w-12 p-1 rounded-lg text-center bg-white font-bold border-none" />
                  </div>
                  <button disabled={isCoffeeConfirmed} onClick={() => {setCoffeeOperator(coffeeOperator === '+' ? '-' : '+'); setIsCoffeeConfirmed(false);}} className={`w-8 h-8 rounded-full font-black text-lg flex items-center justify-center transition-colors ${coffeeOperator === '+' ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white'}`}>{coffeeOperator}</button>
                  <div className="flex flex-col items-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase">Extra</span>
                      <input disabled={isCoffeeConfirmed} type="number" value={coffeeExtra} placeholder="0" onChange={e => {setCoffeeExtra(e.target.value); setIsCoffeeConfirmed(false);}} className="w-12 p-1 rounded-lg text-center bg-white font-bold border-none" />
                  </div>
                  <button onClick={handleConfirmCoffee} className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase shadow-md transition-all ${isCoffeeConfirmed ? 'bg-green-600 text-white' : 'bg-orange-600 text-white hover:scale-105'}`}>{isCoffeeConfirmed ? 'Confirmed' : 'Confirm'}</button>
              </div>
            )}
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-3 border-2 border-slate-200 rounded-2xl font-bold bg-white text-slate-900" />
          </div>
        </header>

        {viewMode === 'weekly' && (
          <div className="animate-in slide-in-from-top-4 duration-500">
            <div className="mb-4 bg-slate-800 text-white p-6 rounded-3xl shadow-lg flex justify-between items-center">
               <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Business Week</p>
                  <p className="text-lg font-bold">{new Date(weekRange.mon).toLocaleDateString()} — {new Date(weekRange.sun).toLocaleDateString()}</p>
               </div>
               <div className="text-right"><p className="text-[10px] font-black text-orange-400 uppercase mb-1">Total Weekly Coffee</p>
                  <p className="text-4xl font-black text-orange-500">{confirmedWeeklyCoffee.toFixed(1)} <span className="text-sm">KG</span></p>
               </div>
            </div>
            <div className="grid grid-cols-7 gap-2 mb-8 px-2">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, idx) => {
                    const date = new Date(weekRange.mon); date.setDate(date.getDate() + idx);
                    return (
                        <div key={day} className="text-center">
                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{day}</p>
                            <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm font-black text-xs text-slate-700">{getCoffeeForDate(date.toISOString().split('T')[0])}</div>
                        </div>
                    )
                })}
            </div>
          </div>
        )}

        <div className="mb-10 text-left">
          <h2 className="text-xs font-black text-white bg-slate-800 px-5 py-1.5 inline-block rounded-t-xl uppercase ml-2 tracking-widest">FOH Team</h2>
          <div className="border-t-4 border-slate-800 pt-6">
            {viewMode === 'daily' ? shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === "FOH Team").map(s => (
                <div key={s.Id} className={`bg-white p-5 rounded-2xl shadow-sm border mb-4 transition-all ${getLatestLog(s.Id) ? STATUS_COLORS[getLatestLog(s.Id).action_type].border : 'border-slate-200'}`}>
                    <div className="flex justify-between items-center gap-4 text-left">
                        <div className="flex-1"><h2 className="text-2xl font-black text-slate-900 uppercase leading-none">{s._DPMetaData?.EmployeeInfo?.DisplayName}</h2><div className="mt-2">{renderTimeDisplay(s)}</div></div>
                        {renderActionButtons(s, getLatestLog(s.Id))}
                    </div>
                    {getLatestLog(s.Id) && <div className={`mt-4 p-3 rounded-xl border text-xs ${STATUS_COLORS[getLatestLog(s.Id).action_type].light} ${STATUS_COLORS[getLatestLog(s.Id).action_type].text}`}><strong>{getLatestLog(s.Id).action_type.replace('_',' ')}:</strong> {getLatestLog(s.Id).notes}</div>}
                    {renderEditForm(s)}
                </div>
            )) : renderWeeklySection(shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === "FOH Team"))}
          </div>
        </div>
        
        <div className="text-left">
          <h2 className="text-xs font-black text-white bg-orange-600 px-5 py-1.5 inline-block rounded-t-xl uppercase ml-2 tracking-widest">BOH Team</h2>
          <div className="border-t-4 border-orange-600 pt-6">
            {viewMode === 'daily' ? shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === "BOH Team").map(s => (
                <div key={s.Id} className={`bg-white p-5 rounded-2xl shadow-sm border mb-4 transition-all ${getLatestLog(s.Id) ? STATUS_COLORS[getLatestLog(s.Id).action_type].border : 'border-slate-200'}`}>
                    <div className="flex justify-between items-center gap-4 text-left">
                        <div className="flex-1"><h2 className="text-2xl font-black text-slate-900 uppercase leading-none">{s._DPMetaData?.EmployeeInfo?.DisplayName}</h2><div className="mt-2">{renderTimeDisplay(s)}</div></div>
                        {renderActionButtons(s, getLatestLog(s.Id))}
                    </div>
                    {getLatestLog(s.Id) && <div className={`mt-4 p-3 rounded-xl border text-xs ${STATUS_COLORS[getLatestLog(s.Id).action_type].light} ${STATUS_COLORS[getLatestLog(s.Id).action_type].text}`}><strong>{getLatestLog(s.Id).action_type.replace('_',' ')}:</strong> {getLatestLog(s.Id).notes}</div>}
                    {renderEditForm(s)}
                </div>
            )) : renderWeeklySection(shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === "BOH Team"))}
          </div>
        </div>
      </div>
    </div>
  );
}