import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  Plus,
  Trash2,
  TrendingUp,
  Table as TableIcon,
  BarChart3,
  Download,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Scale,
  Activity,
  Dumbbell,
  LogIn,
  LogOut,
  Settings,
  FileSpreadsheet,
  Calendar,
} from "lucide-react";
import { format, parseISO, subDays, isAfter } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Entry {
  date: string;
  weight: number;
  body_fat: number;
  muscle_mass_percent: number;
  fat_mass_kg: number;
  muscle_mass_kg: number;
}

// --- Constants ---
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const DISCOVERY_DOC = "https://sheets.googleapis.com/$discovery/rest?version=v4";

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "table">("dashboard");
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem("google_access_token"));
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(localStorage.getItem("bodycomp_sheet_id"));
  const [isGapiLoaded, setIsGapiLoaded] = useState(false);
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "3m" | "all">("7d");

  // Form state
  const [formData, setFormData] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    weight: "",
    body_fat: "",
    muscle_mass_percent: "",
  });

  // --- Google API Initialization ---
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      gapi.load("client", async () => {
        await gapi.client.init({
          discoveryDocs: [DISCOVERY_DOC],
        });
        setIsGapiLoaded(true);
      });
    };
    document.body.appendChild(script);

    const gisScript = document.createElement("script");
    gisScript.src = "https://accounts.google.com/gsi/client";
    document.body.appendChild(gisScript);
  }, []);

  const fetchEntries = useCallback(async (sheetId: string, token: string) => {
    setLoading(true);
    try {
      // @ts-ignore
      gapi.client.setToken({ access_token: token });
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "Sheet1!A:D",
      });

      const rows = response.result.values;
      if (rows && rows.length > 1) {
        const data = rows.slice(1).map((row: any) => {
          const weight = parseFloat(row[1]);
          const bodyFat = parseFloat(row[2]);
          const musclePercent = parseFloat(row[3]);
          return {
            date: row[0],
            weight,
            body_fat: bodyFat,
            muscle_mass_percent: musclePercent,
            fat_mass_kg: (weight * bodyFat) / 100,
            muscle_mass_kg: (weight * musclePercent) / 100,
          };
        }).sort((a: Entry, b: Entry) => b.date.localeCompare(a.date));
        setEntries(data);
      } else {
        setEntries([]);
      }
    } catch (err) {
      console.error("Error fetching entries", err);
      if ((err as any).status === 401) handleLogout();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isGapiLoaded && accessToken && spreadsheetId) {
      fetchEntries(spreadsheetId, accessToken);
    }
  }, [isGapiLoaded, accessToken, spreadsheetId, fetchEntries]);

  // --- Auth Handlers ---
  const handleLogin = () => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.access_token) {
          setAccessToken(response.access_token);
          localStorage.setItem("google_access_token", response.access_token);
        }
      },
    });
    client.requestAccessToken();
  };

  const handleLogout = () => {
    setAccessToken(null);
    localStorage.removeItem("google_access_token");
    setEntries([]);
  };

  const handleSetSheetId = () => {
    const id = prompt("Bitte gib die Google Spreadsheet ID ein (aus der URL):");
    if (id) {
      setSpreadsheetId(id);
      localStorage.setItem("bodycomp_sheet_id", id);
    }
  };

  const handleCreateSheet = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      // @ts-ignore
      gapi.client.setToken({ access_token: accessToken });
      const response = await gapi.client.sheets.spreadsheets.create({
        resource: {
          properties: { title: "BodyComp Tracker Data" },
        },
      });
      const newId = response.result.spreadsheetId;
      
      // Initialize header
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: newId,
        range: "Sheet1!A1",
        valueInputOption: "RAW",
        resource: {
          values: [["Date", "Weight (kg)", "Body Fat (%)", "Muscle (%)"]],
        },
      });

      setSpreadsheetId(newId);
      localStorage.setItem("bodycomp_sheet_id", newId);
      alert("Neue Tabelle erstellt!");
    } catch (err) {
      console.error("Error creating sheet", err);
    } finally {
      setLoading(false);
    }
  };

  // --- Data Handlers ---
  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !spreadsheetId || !formData.weight || !formData.body_fat || !formData.muscle_mass_percent) return;

    setLoading(true);
    try {
      // @ts-ignore
      gapi.client.setToken({ access_token: accessToken });
      
      // Check if date already exists to update instead of append (simplified: always append for now or handle logic)
      // For simplicity in this demo, we append. A real app would search and update.
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Sheet1!A1",
        valueInputOption: "RAW",
        resource: {
          values: [[formData.date, formData.weight, formData.body_fat, formData.muscle_mass_percent]],
        },
      });

      fetchEntries(spreadsheetId, accessToken);
      setFormData({ ...formData, weight: "", body_fat: "", muscle_mass_percent: "" });
    } catch (err) {
      console.error("Error adding entry", err);
    } finally {
      setLoading(false);
    }
  };

  // --- Computed Data ---
  const chartData = useMemo(() => {
    const now = new Date();
    let filteredEntries = [...entries];

    if (timeRange === "7d") {
      filteredEntries = entries.filter(e => isAfter(parseISO(e.date), subDays(now, 7)));
    } else if (timeRange === "30d") {
      filteredEntries = entries.filter(e => isAfter(parseISO(e.date), subDays(now, 30)));
    } else if (timeRange === "3m") {
      filteredEntries = entries.filter(e => isAfter(parseISO(e.date), subDays(now, 90)));
    }

    const baseData = filteredEntries.reverse().map((e) => ({
      ...e,
      formattedDate: format(parseISO(e.date), "dd.MM."),
    }));

    if (baseData.length < 2) return baseData;

    const keys = ["weight", "fat_mass_kg", "muscle_mass_kg", "body_fat", "muscle_mass_percent"];
    let enrichedData = [...baseData];

    keys.forEach(key => {
      const n = enrichedData.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;

      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += enrichedData[i][key as keyof typeof enrichedData[0]] as number;
        sumXY += i * (enrichedData[i][key as keyof typeof enrichedData[0]] as number);
        sumXX += i * i;
      }

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      enrichedData = enrichedData.map((d, i) => ({
        ...d,
        [`${key}_trend`]: slope * i + intercept,
      }));
    });

    return enrichedData;
  }, [entries, timeRange]);

  const latestEntry = entries[0];

  // --- Render Helpers ---
  const CustomTooltip = ({ active, payload, label, unit }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload.find((p: any) => p.name !== "Trend");
      if (!dataPoint) return null;
      return (
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xl">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-sm font-bold text-slate-900">
            {dataPoint.value.toFixed(1)} <span className="text-slate-400 font-normal">{unit}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const renderChart = (title: string, dataKey: string, color: string, unit: string, type: "area" | "line" = "line") => (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-6 flex items-center gap-2">
        {unit === "kg" ? <Scale className="w-5 h-5 text-indigo-600" /> : <BarChart3 className="w-5 h-5 text-indigo-600" />}
        {title} ({unit})
      </h3>
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === "area" ? (
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`color${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.1} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip content={<CustomTooltip unit={unit} />} />
              <Area name={title} type="monotone" dataKey={dataKey} stroke={color} strokeWidth={3} fillOpacity={1} fill={`url(#color${dataKey})`} />
              <Line name="Trend" type="monotone" dataKey={`${dataKey}_trend`} stroke={color} strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} />
            </AreaChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip content={<CustomTooltip unit={unit} />} />
              <Line name={title} type="monotone" dataKey={dataKey} stroke={color} strokeWidth={3} dot={{ r: 4, fill: color, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              <Line name="Trend" type="monotone" dataKey={`${dataKey}_trend`} stroke={color} strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <TrendingUp className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">BodyComp Tracker</h1>
          </div>
          <div className="flex items-center gap-4">
            {!accessToken ? (
              <button
                onClick={handleLogin}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-indigo-700 transition-all"
              >
                <LogIn className="w-4 h-4" />
                Google Login
              </button>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Verbunden
                </div>
                <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!accessToken ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <div className="bg-indigo-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileSpreadsheet className="w-10 h-10 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Willkommen beim BodyComp Tracker</h2>
            <p className="text-slate-500 max-w-md mx-auto mb-8">
              Verwalte deine Fitness-Daten direkt in deiner eigenen Google Tabelle. Sicher, kostenlos und überall verfügbar.
            </p>
            <button
              onClick={handleLogin}
              className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold shadow-xl shadow-indigo-200 hover:scale-105 transition-transform"
            >
              Mit Google starten
            </button>
          </div>
        ) : !spreadsheetId ? (
          <div className="max-w-2xl mx-auto text-center py-12">
            <h2 className="text-xl font-bold mb-6">Tabelle einrichten</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={handleCreateSheet}
                className="p-8 bg-white border-2 border-dashed border-indigo-200 rounded-3xl hover:border-indigo-400 transition-all group"
              >
                <Plus className="w-8 h-8 text-indigo-400 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-slate-900">Neue Tabelle erstellen</span>
              </button>
              <button
                onClick={handleSetSheetId}
                className="p-8 bg-white border-2 border-dashed border-slate-200 rounded-3xl hover:border-slate-400 transition-all group"
              >
                <Settings className="w-8 h-8 text-slate-400 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-slate-900">Bestehende ID verknüpfen</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Form */}
            <div className="lg:col-span-4 lg:sticky lg:top-24">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  Neuer Eintrag
                </h2>
                <form onSubmit={handleAddEntry} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Datum</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[42px] min-w-0"
                        required
                      />
                      <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Gewicht (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[42px]"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Fett (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={formData.body_fat}
                        onChange={(e) => setFormData({ ...formData, body_fat: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[42px]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Muskeln (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={formData.muscle_mass_percent}
                        onChange={(e) => setFormData({ ...formData, muscle_mass_percent: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[42px]"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                  >
                    {loading ? "Speichert..." : "Eintrag speichern"}
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Stats, Table & Charts */}
            <div className="lg:col-span-8 space-y-8">
              {/* Quick Stats */}
              {latestEntry && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                    <div className="flex items-center gap-2 text-slate-500 mb-3">
                      <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Fettmasse</span>
                    </div>
                    <div className="text-3xl sm:text-6xl font-bold text-slate-900 leading-none">
                      {latestEntry.fat_mass_kg.toFixed(1)}
                      <span className="text-sm sm:text-2xl font-normal text-slate-400 ml-1">kg</span>
                    </div>
                  </div>
                  <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                    <div className="flex items-center gap-2 text-slate-500 mb-3">
                      <Dumbbell className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Muskelmasse</span>
                    </div>
                    <div className="text-3xl sm:text-6xl font-bold text-slate-900 leading-none">
                      {latestEntry.muscle_mass_kg.toFixed(1)}
                      <span className="text-sm sm:text-2xl font-normal text-slate-400 ml-1">kg</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 7-Day History Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <TableIcon className="w-5 h-5 text-indigo-600" />
                    Letzte 7 Einträge
                  </h3>
                  <button
                    onClick={() => setActiveTab(activeTab === "table" ? "dashboard" : "table")}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    {activeTab === "table" ? "Zurück zum Dashboard" : "Alle Einträge anzeigen"}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Datum</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fett kg</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Muskel kg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(activeTab === "table" ? entries : entries.slice(0, 7)).map((entry, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3 text-sm font-medium text-slate-900">{format(parseISO(entry.date), "dd.MM.yy")}</td>
                          <td className="px-6 py-3 text-sm text-red-600 font-medium">{entry.fat_mass_kg.toFixed(1)}</td>
                          <td className="px-6 py-3 text-sm text-emerald-600 font-medium">{entry.muscle_mass_kg.toFixed(1)}</td>
                        </tr>
                      ))}
                      {entries.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-8 text-center text-slate-400 italic text-sm">Noch keine Daten vorhanden</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dashboard Charts */}
              {activeTab === "dashboard" && (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-slate-900">
                        <TrendingUp className="w-5 h-5 text-indigo-600" />
                        <h3 className="font-bold">Zeitraum auswählen</h3>
                      </div>
                      <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-fit">
                        {[
                          { id: "7d", label: "7 Tage" },
                          { id: "30d", label: "30 Tage" },
                          { id: "3m", label: "3 Monate" },
                          { id: "all", label: "Alle" },
                        ].map((range) => (
                          <button
                            key={range.id}
                            onClick={() => setTimeRange(range.id as any)}
                            className={cn(
                              "flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all",
                              timeRange === range.id
                                ? "bg-white text-indigo-600 shadow-sm"
                                : "text-slate-500 hover:text-slate-700"
                            )}
                          >
                            {range.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {renderChart("Fettmasse", "fat_mass_kg", "#ef4444", "kg")}
                    {renderChart("Muskelmasse", "muscle_mass_kg", "#10b981", "kg")}
                  </div>
                  <div className="grid grid-cols-1 gap-6">
                    {renderChart("Gewichtsverlauf", "weight", "#4f46e5", "kg", "area")}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {renderChart("Körperfett", "body_fat", "#f59e0b", "%")}
                    {renderChart("Muskelanteil", "muscle_mass_percent", "#06b6d4", "%")}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom: Config (appears last on mobile, sidebar bottom on desktop) */}
            <div className="lg:col-span-4 lg:col-start-1">
              <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Konfiguration
                  </h3>
                </div>
                <div className="text-xs text-slate-400 mb-4 break-all">
                  <span className="block font-bold text-slate-300 uppercase mb-1">Spreadsheet ID:</span>
                  {spreadsheetId}
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem("bodycomp_sheet_id");
                    setSpreadsheetId(null);
                  }}
                  className="text-xs text-red-400 hover:text-red-300 font-bold"
                >
                  Verknüpfung lösen
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
