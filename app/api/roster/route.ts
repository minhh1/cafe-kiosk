import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const token = process.env.DEPUTY_TOKEN;
    const subdomain = process.env.DEPUTY_SUBDOMAIN;

    const url = `https://${subdomain}.deputy.com/api/v1/resource/Roster/QUERY`;

    // If only one date is provided, we treat it as a single day query
    // If two dates are provided, we fetch the range
    const searchConfig = endDate 
      ? {
          s1: { field: "Date", type: "ge", data: startDate },
          s2: { field: "Date", type: "le", data: endDate }
        }
      : {
          f1: { field: "Date", type: "eq", data: startDate }
        };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        search: searchConfig,
        join: ["Employee"]
      }),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}