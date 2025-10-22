import { useLocation } from "react-router";
import "./styles.css";

export default function DataWidget() {
  const location = useLocation();

  return (
    <div className="data-widget p-8 bg-amber-50 rounded-2xl shadow-lg max-w-2xl border-2 border-amber-200">
      <h1 className="text-4xl font-bold text-amber-900 mb-4">Data Widget</h1>
      <p className="text-amber-700 mb-6">This widget uses React Router hooks to display location data.</p>
      <div className="space-y-4">
        <div className="p-4 bg-white rounded-lg shadow-sm border border-amber-100">
          <strong className="text-amber-900 font-semibold">Current pathname:</strong>{" "}
          <span className="text-amber-700 font-mono">{location.pathname}</span>
        </div>
        <div className="p-4 bg-white rounded-lg shadow-sm border border-amber-100">
          <strong className="text-amber-900 font-semibold">Current search:</strong>{" "}
          <span className="text-amber-700 font-mono">{location.search || "(none)"}</span>
        </div>
        <div className="p-4 bg-white rounded-lg shadow-sm border border-amber-100">
          <strong className="text-amber-900 font-semibold">Current hash:</strong>{" "}
          <span className="text-amber-700 font-mono">{location.hash || "(none)"}</span>
        </div>
      </div>
    </div>
  );
}
