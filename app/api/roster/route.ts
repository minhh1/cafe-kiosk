import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = process.env.DEPUTY_TOKEN;
    const subdomain = process.env.DEPUTY_SUBDOMAIN;

    // 1. Handle different parameter names (?date= OR ?startDate=)
    const singleDate = searchParams.get('date');
    const start = searchParams.get('startDate') || singleDate || new Date().toISOString().split('T')[0];
    const end = searchParams.get('endDate') || singleDate || start;

    if (!token || !subdomain) return NextResponse.json({ error: "Config missing" }, { status: 500 });

    const url = `https://${subdomain}.deputy.com/api/v1/resource/Roster/QUERY`;

    // 2. Build the search query
    const searchConfig = (start === end) 
      ? { f1: { field: "Date", type: "eq", data: start } }
      : {
          f1: { field: "Date", type: "ge", data: start },
          f2: { field: "Date", type: "le", data: end }
        };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ search: searchConfig, join: ["Employee"] }),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}