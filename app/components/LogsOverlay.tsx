import React, { useState } from 'react';

export default function LogsOverlay({ syncLogs, activityLogs, onClose }: any) {
  const [tab, setTab] = useState('activity');

  return (
    <div className="fixed inset-0 bg-white z-[600] flex flex-col font-sans animate-in fade-in duration-300">
      <div className="p-6 border-b flex justify-between items-center bg-slate-900 text-white">
        <h2 className="text-xl font-black uppercase italic">Manager Audit Logs</h2>
        <button onClick={onClose} className="bg-white/10 px-4 py-2 rounded-xl text-xs font-bold uppercase">Close</button>
      </div>

      <div className="flex bg-slate-100 p-1 m-4 rounded-xl">
        <button onClick={() => setTab('activity')} className={`flex-1 py-3 rounded-lg text-xs font-black uppercase transition-all ${tab === 'activity' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>Site Activity</button>
        <button onClick={() => setTab('sync')} className={`flex-1 py-3 rounded-lg text-xs font-black uppercase transition-all ${tab === 'sync' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>Sync History</button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-10">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-white border-b uppercase text-[10px] text-slate-400">
            <tr><th className="py-4">Time</th><th>Staff</th><th>Action</th><th>Details</th></tr>
          </thead>
          <tbody>
            {tab === 'activity' ? activityLogs.map((log: any) => (
              <tr key={log.id} className="border-b">
                <td className="py-4 font-bold text-slate-400">{new Date(log.created_at).toLocaleString()}</td>
                <td className="font-black text-slate-900">{log.staff_name}</td>
                <td><span className={`px-2 py-1 rounded font-black text-[9px] ${log.action_type.startsWith('EDIT') ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>{log.action_type.replace('_',' ')}</span></td>
                <td className="text-slate-600">
                  {/* SHOW UPDATED TIME IN LOGS */}
                  {(log.override_start || log.override_end) && (
                    <span className="font-black text-blue-600 mr-2">New Time: {log.override_start || log.override_end}</span>
                  )}
                  {log.notes && <span className="italic">"{log.notes}"</span>}
                </td>
              </tr>
            )) : syncLogs.map((log: any) => (
              <tr key={log.id} className="border-b">
                <td className="py-4 font-bold text-slate-400">{new Date(log.sync_time).toLocaleString()}</td>
                <td className="font-black text-slate-900">{log.rows_affected} Items</td>
                <td className="font-bold">{log.status}</td>
                <td className="text-slate-500 italic">{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}